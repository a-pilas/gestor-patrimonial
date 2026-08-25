// Candado de acceso local a la app. Es una barrera simple en el propio
// navegador (no hay servidor): protege de que alguien abra la app sin más
// en este dispositivo, pero no es seguridad real (el código es visible).
// La contraseña nunca se guarda en texto plano, solo su hash SHA-256, y
// nunca sale de este navegador.

const PIN_KEY = "gestorPatrimonial:pin";
const SESSION_KEY = "gestorPatrimonial:unlocked";

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getStoredPin() {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredPin(hash, hint) {
  localStorage.setItem(PIN_KEY, JSON.stringify({ hash, hint: hint || "" }));
}

export function hasPin() {
  return !!getStoredPin();
}

export function removePin() {
  localStorage.removeItem(PIN_KEY);
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

function renderSetup(resolve) {
  const el = overlay();
  el.innerHTML = `
    <div class="lock-card">
      <h2>Configura una contraseña</h2>
      <p class="muted">Protege el acceso a esta app en este dispositivo. Es un candado local: no envía nada a ningún servidor y solo afecta a este navegador.</p>
      <form id="lock-setup-form" class="stacked-form">
        <label>Contraseña <input name="pin" type="password" required minlength="4" autocomplete="new-password" /></label>
        <label>Repite la contraseña <input name="pin2" type="password" required minlength="4" autocomplete="new-password" /></label>
        <label>Pista (opcional, se muestra si la olvidas) <input name="hint" placeholder="Opcional" /></label>
        <button type="submit">Guardar y entrar</button>
      </form>
      <p id="lock-error" class="neg"></p>
    </div>
  `;
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
