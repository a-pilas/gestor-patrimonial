// Candado de acceso a la app. No es seguridad real (el código es visible),
// es un filtro sencillo para que nadie la abra sin más. La contraseña nunca
// se guarda en texto plano, solo su hash SHA-256 — y desde que existe la
// sincronización con Drive, vive dentro del propio store (store.security),
// así que es la MISMA en todos los dispositivos conectados, no una por
// navegador como al principio.

import { store } from "./store.js";
import { conectar as conectarDrive } from "./sync.js";
import { esModoFamilia, activarModoFamilia, desactivarModoFamilia } from "./modo.js";
import { elegirFicheroCompartido, metadatosFichero, ErrorSinSesion, ErrorSinAcceso } from "./drive.js";
import { actualizar, validarFichero, esc } from "./familia.js";

const SESSION_KEY = "gestorPatrimonial:unlocked";

function cryptoAvailable() {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getStoredPin() {
  const { pinHash, pinHint } = store.get().security;
  return pinHash ? { hash: pinHash, hint: pinHint } : null;
}

function setStoredPin(hash, hint) {
  store.updateSecurity({ pinHash: hash, pinHint: hint || "" });
}

export function hasPin() {
  return !!getStoredPin();
}

export function removePin() {
  store.updateSecurity({ pinHash: null, pinHint: "" });
  sessionStorage.removeItem(SESSION_KEY);
}

export async function changePin(currentPin, newPin, hint) {
  const stored = getStoredPin();
  if (stored) {
    const currentHash = await sha256(currentPin);
    if (currentHash !== stored.hash) return false;
  }
  setStoredPin(await sha256(newPin), hint);
  return true;
}

function overlay() {
  let el = document.getElementById("lock-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "lock-overlay";
    el.className = "lock-overlay";
    document.body.appendChild(el);
  }
  return el;
}

export function ensureUnlocked() {
  return new Promise((resolve) => {
    if (!cryptoAvailable()) {
      renderCryptoUnavailable(resolve);
      return;
    }
    if (esModoFamilia()) {
      // Sin copia local no hay contraseña guardada en este equipo: primero se
      // baja el fichero de Drive (ahí viaja el candado) y luego se pide.
      renderFamiliaConectando(resolve);
      return;
    }
    const stored = getStoredPin();
    if (!stored) {
      renderSetup(resolve);
      return;
    }
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      resolve();
      return;
    }
    renderUnlock(stored, resolve);
  });
}

function renderCryptoUnavailable(resolve) {
  const el = overlay();
  el.innerHTML = `
    <div class="lock-card">
      <h2>Candado no disponible</h2>
      <p class="muted">Esta conexión no es segura (falta HTTPS), así que el navegador no permite cifrar la contraseña y el candado no se puede activar aquí todavía. Esto es normal justo después de configurar un dominio propio: el certificado puede tardar unas horas en emitirse.</p>
      <p class="muted">Mientras tanto puedes seguir usando la app con normalidad.</p>
      <button type="button" id="lock-continue">Continuar sin candado</button>
    </div>
  `;
  el.querySelector("#lock-continue").addEventListener("click", () => {
    el.remove();
    resolve();
  });
}

function renderSetup(resolve) {
  const el = overlay();
  el.innerHTML = `
    <div class="lock-card">
      <h2>Configura una contraseña</h2>
      <p class="muted">Protege el acceso a esta app en este dispositivo.</p>
      <p class="muted">Si ya usas la app en otro dispositivo, conecta primero con Drive para traer la misma contraseña y tus datos — así no tienes que crear una nueva aquí.</p>
      <button type="button" id="lock-connect-drive">Conectar con Google Drive</button>
      <p id="lock-connect-status" class="muted"></p>
      <p class="muted" style="margin-top:16px">O, si es la primera vez que usas la app en cualquier dispositivo, configura una contraseña nueva:</p>
      <form id="lock-setup-form" class="stacked-form">
        <label>Contraseña <input name="pin" type="password" required minlength="4" autocomplete="new-password" /></label>
        <label>Repite la contraseña <input name="pin2" type="password" required minlength="4" autocomplete="new-password" /></label>
        <label>Pista (opcional, se muestra si la olvidas) <input name="hint" placeholder="Opcional" /></label>
        <button type="submit">Guardar y entrar</button>
      </form>
      <p id="lock-error" class="neg"></p>
      <hr class="lock-sep" />
      <p class="muted">¿Eres de la familia y solo vas a <strong>consultar</strong> los datos que te han compartido?</p>
      <button type="button" id="lock-familiar" class="secondary">Soy familiar (solo lectura)</button>
      <p id="lock-familiar-status" class="muted"></p>
    </div>
  `;

  el.querySelector("#lock-familiar").addEventListener("click", () => activarComoFamiliar(el, resolve));

  el.querySelector("#lock-connect-drive").addEventListener("click", async (ev) => {
    const btn = ev.target;
    const status = el.querySelector("#lock-connect-status");
    btn.disabled = true;
    status.textContent = "Conectando…";
    const ok = await conectarDrive({ interactivo: true });
    btn.disabled = false;
    if (!ok) {
      status.textContent = "No se pudo conectar. Puedes reintentarlo o configurar una contraseña nueva abajo.";
      return;
    }
    // Tras conectar, pullInicial ya ha traído (o inicializado) los datos:
    // si ahora hay contraseña, pasamos a pedirla; si no, este es el primer
    // dispositivo conectado y se sigue con el formulario de abajo.
    const stored = getStoredPin();
    if (stored) {
      el.remove();
      renderUnlock(stored, resolve);
    } else {
      status.textContent = "Conectado. Como todavía no hay contraseña guardada, define una abajo — quedará sincronizada para el resto de dispositivos.";
    }
  });

  el.querySelector('input[name="pin"]').focus();
  el.querySelector("#lock-setup-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const pin = fd.get("pin");
    const pin2 = fd.get("pin2");
    if (pin !== pin2) {
      el.querySelector("#lock-error").textContent = "Las contraseñas no coinciden.";
      return;
    }
    setStoredPin(await sha256(pin), fd.get("hint"));
    sessionStorage.setItem(SESSION_KEY, "1");
    el.remove();
    resolve();
  });
}

function renderUnlock(stored, resolve) {
  const el = overlay();
  el.innerHTML = `
    <div class="lock-card">
      <h2>Introduce tu contraseña</h2>
      <form id="lock-form" class="stacked-form">
        <label>Contraseña <input name="pin" type="password" required autocomplete="current-password" /></label>
        <button type="submit">Entrar</button>
      </form>
      ${
        stored.hint
          ? `<button type="button" id="lock-hint-btn" class="link-btn">¿Pista?</button><p id="lock-hint-text" class="muted" style="display:none">${stored.hint}</p>`
          : ""
      }
      <p id="lock-error" class="neg"></p>
    </div>
  `;
  el.querySelector('input[name="pin"]').focus();
  el.querySelector("#lock-hint-btn")?.addEventListener("click", () => {
    el.querySelector("#lock-hint-text").style.display = "block";
  });
  el.querySelector("#lock-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const hash = await sha256(fd.get("pin"));
    if (hash === stored.hash) {
      sessionStorage.setItem(SESSION_KEY, "1");
      el.remove();
      resolve();
    } else {
      el.querySelector("#lock-error").textContent = "Contraseña incorrecta.";
      el.querySelector('input[name="pin"]').value = "";
      el.querySelector('input[name="pin"]').focus();
    }
  });
}


// ---------------------------------------------------------------------------
// Modo familiar
// ---------------------------------------------------------------------------

// Tras tener los datos en memoria: pide la contraseña del candado (que viaja
// dentro del fichero) o entra directo si el propietario no puso ninguna.
function continuarTrasCargaFamilia(resolve) {
  const stored = getStoredPin();
  if (!stored || sessionStorage.getItem(SESSION_KEY) === "1") {
    overlay().remove();
    resolve();
    return;
  }
  renderUnlock(stored, resolve);
}

function mensajeError(e) {
  if (e instanceof ErrorSinAcceso) return "Este fichero ya no está compartido contigo. Pide al propietario que te lo vuelva a compartir.";
  if (e instanceof ErrorSinSesion) return "Hace falta conectar con tu cuenta de Google.";
  return e?.message || "Ha ocurrido un error inesperado.";
}

// Apertura normal de un equipo que ya es "familiar": intenta conectar solo
// (sin ventanas) y, si Google lo pide, deja un botón con un clic.
function renderFamiliaConectando(resolve) {
  const el = overlay();
  el.innerHTML = `
    <div class="lock-card">
      <h2>Gestor patrimonial CELIANCA</h2>
      <p class="muted">Modo familiar · solo lectura</p>
      <p id="fam-estado" class="muted">Conectando con Google Drive…</p>
      <div id="fam-botones" class="btn-row" style="display:none">
        <button type="button" id="fam-conectar">Conectar con Google</button>
      </div>
      <button type="button" id="fam-salir" class="link-btn danger" style="display:none">Dejar el modo familiar en este equipo</button>
    </div>
  `;
  const estado = el.querySelector("#fam-estado");
  const botones = el.querySelector("#fam-botones");
  const salir = el.querySelector("#fam-salir");

  async function intentar(gesto) {
    estado.textContent = "Conectando con Google Drive…";
    botones.style.display = "none";
    try {
      await actualizar({ gesto, forzar: true });
      continuarTrasCargaFamilia(resolve);
    } catch (e) {
      estado.textContent = mensajeError(e) + (e instanceof ErrorSinSesion || e instanceof ErrorSinAcceso ? "" : " Reintenta en un momento.");
      botones.style.display = "flex";
      salir.style.display = "inline-block";
    }
  }
  el.querySelector("#fam-conectar").addEventListener("click", () => intentar(true));
  salir.addEventListener("click", () => {
    desactivarModoFamilia();
    location.reload();
  });
  intentar(false);
}

// Primera vez en este equipo: elegir el fichero compartido con el selector de
// Google, comprobar de quién es y con qué permiso, y confirmar.
async function activarComoFamiliar(el, resolve) {
  const boton = el.querySelector("#lock-familiar");
  const estado = el.querySelector("#lock-familiar-status");
  boton.disabled = true;
  estado.textContent = "Abriendo Google… elige tu cuenta y, después, el fichero que te han compartido.";
  try {
    const elegido = await elegirFicheroCompartido();
    if (!elegido) {
      estado.textContent = "Cancelado. Puedes volver a intentarlo.";
      return;
    }
    const meta = await metadatosFichero(elegido.id, { gesto: true });
    validarFichero(meta);
    renderConfirmarFamilia(el, resolve, meta);
  } catch (e) {
    estado.textContent = mensajeError(e);
  } finally {
    boton.disabled = false;
  }
}

function renderConfirmarFamilia(el, resolve, meta) {
  const propietario = meta.owners?.[0]?.emailAddress || meta.owners?.[0]?.displayName || "desconocido";
  const solo = meta.capabilities?.canEdit === false;
  el.innerHTML = `
    <div class="lock-card">
      <h2>Confirma el fichero</h2>
      <p class="muted">Vas a ver, <strong>en solo lectura</strong>, el fichero «${esc(meta.name)}» de:</p>
      <p><strong>${esc(propietario)}</strong></p>
      <p class="muted">${
        solo
          ? "✅ Tu permiso en Drive es solo lectura."
          : "⚠ Tienes permiso de edición sobre este fichero. La app seguirá en solo lectura, pero conviene pedir que te lo compartan como «Lector»."
      }</p>
      <p class="muted">No se guardará ninguna copia de los datos en este equipo.</p>
      <div class="btn-row">
        <button type="button" id="fam-ok">Es correcto, abrir</button>
        <button type="button" id="fam-cancelar" class="link-btn">Cancelar</button>
      </div>
      <p id="fam-error" class="neg"></p>
    </div>
  `;
  el.querySelector("#fam-cancelar").addEventListener("click", () => renderSetup(resolve));
  el.querySelector("#fam-ok").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    activarModoFamilia(meta.id);
    try {
      await actualizar({ gesto: true, forzar: true });
      continuarTrasCargaFamilia(resolve);
    } catch (e) {
      desactivarModoFamilia();
      ev.target.disabled = false;
      el.querySelector("#fam-error").textContent = mensajeError(e);
    }
  });
}
