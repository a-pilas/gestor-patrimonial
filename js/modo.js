// Modo familiar: un dispositivo "familiar" ve los datos de otra persona en
// SOLO LECTURA, en vivo desde su fichero de Drive, y no guarda nada en el
// equipo (ni localStorage ni caché): los datos viven solo en la memoria de
// la pestaña. Este módulo no importa nada a propósito, para que lo puedan
// usar store.js, drive.js y sync.js sin dependencias circulares.
//
// Lo único que se guarda en este equipo es el id del fichero compartido
// (un identificador sin datos). Quien manda de verdad es Google: el
// fichero se comparte con rol "Lector", así que aunque alguien manipulara
// esta app, Drive rechazaría cualquier escritura.

const KEY = "gestorPatrimonial:familia";

export class SoloLecturaError extends Error {
  constructor() {
    super("Modo familiar: esta aplicación está en solo lectura.");
    this.name = "SoloLecturaError";
  }
}

export function ficheroFamilia() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function esModoFamilia() {
  return !!ficheroFamilia();
}

function marcarCuerpo(activo) {
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("solo-lectura", activo);
  }
}

export function activarModoFamilia(fileId) {
  localStorage.setItem(KEY, fileId);
  marcarCuerpo(true);
}

export function desactivarModoFamilia() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sin acceso a localStorage: nada que quitar */
  }
  marcarCuerpo(false);
}

marcarCuerpo(esModoFamilia());
