// Modo familiar (solo lectura): carga y refresco de los datos desde el fichero
// de Drive compartido, banner de estado y pantalla de Ajustes propia.
// Nada de lo que se baja se guarda en el equipo: va solo a la memoria del
// store (replaceAll silencioso, y persist() no escribe en modo familiar).

import { store } from "./store.js";
import {
  metadatosFichero,
  descargarFichero,
  reconectarConGesto,
  olvidarConexion,
  nombreFicheroDatos,
  ErrorSinSesion,
  ErrorSinAcceso,
} from "./drive.js";
import { ficheroFamilia, desactivarModoFamilia } from "./modo.js";

const REFRESCO_MS = 5 * 60 * 1000;
const MIN_ENTRE_COMPROBACIONES_MS = 60 * 1000;

let modificadoConocido = null;
let ultimaActualizacion = null;
let ultimaComprobacion = 0;
let info = { propietario: "", puedeEditar: null };
let problema = null; // null | "sin-sesion" | "sin-acceso" | "red"
let temporizador = null;
let alCambiar = () => {};

export function infoFamilia() {
  return { ...info, ultimaActualizacion, problema };
}

// Comprueba la ficha del fichero (barata) y solo descarga el contenido si ha
// cambiado desde la última vez. Devuelve true si llegaron datos nuevos.
// Lanza ErrorSinSesion / ErrorSinAcceso / Error según el fallo.
export async function actualizar({ gesto = false, forzar = false } = {}) {
  const id = ficheroFamilia();
  if (!id) throw new Error("Este equipo no está en modo familiar.");
  const meta = await metadatosFichero(id, { gesto });
  ultimaComprobacion = Date.now();
  info = {
    propietario: meta.owners?.[0]?.emailAddress || meta.owners?.[0]?.displayName || "",
    puedeEditar: meta.capabilities?.canEdit ?? null,
  };
  if (!forzar && meta.modifiedTime === modificadoConocido) {
    ultimaActualizacion = new Date();
    return false;
  }
  const texto = await descargarFichero(id, { gesto });
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error("El fichero compartido no tiene un formato válido.");
  }
  validarDatos(datos);
  store.replaceAll(datos, { silent: true });
  modificadoConocido = meta.modifiedTime;
  ultimaActualizacion = new Date();
  problema = null;
  return true;
}

// Que sea un fichero de datos de la app y no cualquier otro .json.
export function validarDatos(datos) {
  const ok =
    datos &&
    typeof datos === "object" &&
    Array.isArray(datos.assets) &&
    Array.isArray(datos.positions) &&
    Array.isArray(datos.entities);
  if (!ok) throw new Error("El fichero elegido no parece el de datos del Gestor patrimonial.");
}

export function validarFichero(meta) {
  if (meta.name !== nombreFicheroDatos()) {
    throw new Error(`El fichero elegido se llama «${meta.name}», no «${nombreFicheroDatos()}». Elige el que te compartió el propietario.`);
  }
}

function vaciarMemoria() {
  store.replaceAll({}, { silent: true });
  modificadoConocido = null;
}

function clasificar(e) {
  if (e instanceof ErrorSinAcceso) return "sin-acceso";
  if (e instanceof ErrorSinSesion) return "sin-sesion";
  return "red";
}

// Comprobación periódica en segundo plano. Nunca abre ventanas; si no hay
// sesión, deja un aviso con botón para reconectar.
async function comprobarEnSegundoPlano() {
  if (!ficheroFamilia()) return;
  try {
    const cambio = await actualizar();
    pintarBanner();
    if (cambio) alCambiar();
  } catch (e) {
    problema = clasificar(e);
    if (problema === "sin-acceso") {
      vaciarMemoria();
      alCambiar();
    }
    pintarBanner();
  }
}

export function iniciarRefresco(callbackCambio) {
  alCambiar = callbackCambio;
  clearInterval(temporizador);
  temporizador = setInterval(comprobarEnSegundoPlano, REFRESCO_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - ultimaComprobacion > MIN_ENTRE_COMPROBACIONES_MS) {
      comprobarEnSegundoPlano();
    }
  });
  pintarBanner();
}

// Acción de un clic del usuario ("Actualizar" / "Conectar con Google").
export async function actualizarAhora() {
  try {
    if (problema === "sin-sesion") await reconectarConGesto();
    const cambio = await actualizar({ gesto: true, forzar: true });
    pintarBanner();
    if (cambio) alCambiar();
  } catch (e) {
    problema = clasificar(e);
    if (problema === "sin-acceso") {
      vaciarMemoria();
      alCambiar();
    }
    pintarBanner();
  }
}

export function salirDelModoFamiliar() {
  // Primero se vacía la memoria (aún en modo familiar, así no se escribe nada
  // en el navegador) y solo después se desactiva el modo.
  vaciarMemoria();
  desactivarModoFamilia();
  olvidarConexion();
  try {
    sessionStorage.clear();
  } catch {
    /* nada */
  }
  location.reload();
}

// --- Banner fijo bajo la barra de pestañas ---

export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function hora(fecha) {
  return fecha ? fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function pintarBanner() {
  const el = document.getElementById("familia-banner");
  if (!el || !ficheroFamilia()) return;
  let texto;
  let boton = "Actualizar";
  if (problema === "sin-sesion") {
    texto = "Se ha cerrado la conexión con Google. Los datos que ves pueden no estar al día.";
    boton = "Conectar con Google";
  } else if (problema === "sin-acceso") {
    texto = "Ya no tienes acceso al fichero compartido. Pide que te lo vuelvan a compartir.";
    boton = "Reintentar";
  } else if (problema === "red") {
    texto = `Sin conexión con Drive. Se muestran los datos de las ${hora(ultimaActualizacion)}.`;
  } else {
    texto = `Solo lectura · datos de Drive al día a las ${hora(ultimaActualizacion)}`;
  }
  el.className = "familia-banner" + (problema ? " familia-banner-aviso" : "");
  el.innerHTML = `<span>${problema ? "⚠" : "👁"} ${texto}</span><button type="button" class="link-btn" id="btn-familia-banner">${boton}</button>`;
  el.querySelector("#btn-familia-banner").addEventListener("click", actualizarAhora);
}

// --- Pantalla de Ajustes en modo familiar ---

export function renderAjustesFamilia(container) {
  const i = infoFamilia();
  container.innerHTML = `
    <section class="card">
      <h3>Modo familiar · solo lectura</h3>
      <p class="muted">Estás viendo los datos de <strong>${esc(i.propietario) || "su propietario"}</strong>, directamente desde su fichero compartido de Google Drive. No puedes cambiar nada desde aquí, y <strong>no se guarda ninguna copia de los datos en este equipo</strong>: viven solo en la memoria de esta pestaña y desaparecen al cerrarla.</p>
      <p class="muted">Permiso en Drive: ${
        i.puedeEditar === false
          ? "✅ solo lectura (Google no permitiría cambiar el fichero aunque se intentara)."
          : i.puedeEditar === true
            ? "⚠ tienes permiso de edición sobre el fichero. La app sigue en solo lectura, pero conviene pedir al propietario que te lo comparta como «Lector»."
            : "no disponible."
      }</p>
      <p class="muted">Última comprobación: ${hora(i.ultimaActualizacion)} (se comprueba al abrir, al volver a esta pestaña y cada 5 minutos).</p>
      <div class="btn-row">
        <button id="btn-familia-actualizar">Actualizar ahora</button>
      </div>
    </section>

    <section class="card">
      <h3>Quitar el acceso de este equipo</h3>
      <p class="muted">«Dejar el modo familiar» olvida el fichero en este navegador. Para revocar además el permiso de la app en tu cuenta de Google, hazlo en <strong>myaccount.google.com/permissions</strong>. El propietario también puede dejar de compartirte el fichero cuando quiera.</p>
      <div class="btn-row">
        <button id="btn-familia-salir" class="link-btn danger">Dejar el modo familiar en este equipo</button>
      </div>
    </section>
  `;
  container.querySelector("#btn-familia-actualizar").addEventListener("click", async () => {
    await actualizarAhora();
    renderAjustesFamilia(container);
  });
  container.querySelector("#btn-familia-salir").addEventListener("click", () => {
    if (confirm("¿Dejar el modo familiar en este equipo? Tendrás que volver a elegir el fichero para entrar de nuevo.")) {
      salirDelModoFamiliar();
    }
  });
}
