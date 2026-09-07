// Orquesta la sincronización con Drive: conectar, cargar lo último al
// arrancar, guardar automáticamente unos segundos después de cada cambio, y
// avisar (en vez de sobrescribir a ciegas) si detecta que otro dispositivo
// ha guardado en Drive desde la última vez que este lo supo.
//
// Drive pasa a ser la fuente de verdad entre dispositivos; este navegador
// guarda una caché local (localStorage) para poder seguir funcionando sin
// conexión.

import { store, onChange } from "./store.js";
import {
  conectarInteractivo,
  conectarSilencioso,
  guardarEnDrive,
  cargarDesdeDrive,
  obtenerMetadatosRemotos,
  haEstadoConectadoAntes,
  olvidarConexion,
} from "./drive.js";

const SYNC_STATE_KEY = "gestorPatrimonial:driveSyncState";
const PUSH_DEBOUNCE_MS = 4000;

function leerEstadoSync() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_STATE_KEY)) || {};
  } catch {
    return {};
  }
}
function guardarEstadoSync(estado) {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(estado));
}

let conectado = false;
let pushTimer = null;
let sincronizando = false;
let ultimoConflicto = null;
let ultimaSincronizacion = null;
const listenersEstado = [];

function notificar(estado) {
  if (estado.tipo === "sincronizado") ultimaSincronizacion = estado.cuando;
  listenersEstado.forEach((fn) => fn(estado));
}

export function getUltimaSincronizacion() {
  return ultimaSincronizacion;
}

export function onSyncStatus(fn) {
  listenersEstado.push(fn);
}

export function estaConectado() {
  return conectado;
}

export function getUltimoConflicto() {
  return ultimoConflicto;
}

// Aplica contenido recién bajado de Drive al store local sin relanzar un
// guardado de vuelta (silent:true evita el eco ida-y-vuelta), y anota su
// modifiedTime como el último conocido para la detección de conflictos.
function aplicarRemoto(contenido, modifiedTime) {
  const parsed = JSON.parse(contenido);
  store.replaceAll(parsed, { silent: true });
  guardarEstadoSync({ lastKnownModifiedTime: modifiedTime });
}

async function pullInicial() {
  const resultado = await cargarDesdeDrive();
  if (resultado.encontrado) {
    aplicarRemoto(resultado.contenido, resultado.modifiedTime);
    notificar({ tipo: "sincronizado", cuando: new Date() });
  } else {
    // Drive no tiene fichero todavía: este dispositivo es el primero en
    // conectar, así que sube lo que ya hay en local para inicializarlo.
    await empujarAhora();
  }
}

// interactivo:true (botón "Conectar con Drive", pulsado por el usuario) deja
// elegir cuenta siempre. interactivo:false es el intento silencioso al
// abrir la app en un dispositivo ya conectado antes.
export async function conectar({ interactivo = false } = {}) {
  if (conectado) return true;
  try {
    const token = interactivo ? await conectarInteractivo() : await conectarSilencioso();
    if (!token) return false;
    conectado = true;
    onChange(() => programarEmpuje());
    await pullInicial();
    return true;
  } catch (e) {
    notificar({ tipo: "error", mensaje: e.message });
    return false;
  }
}

export function desconectar() {
  conectado = false;
  olvidarConexion();
  clearTimeout(pushTimer);
}

function programarEmpuje() {
  if (!conectado) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(empujarAhora, PUSH_DEBOUNCE_MS);
}

export async function empujarAhora() {
  if (!conectado || sincronizando) return;
  sincronizando = true;
  notificar({ tipo: "sincronizando" });
  try {
    const estado = leerEstadoSync();
    const remoto = await obtenerMetadatosRemotos();
    if (remoto && estado.lastKnownModifiedTime && remoto.modifiedTime !== estado.lastKnownModifiedTime) {
      // Otro dispositivo ha guardado en Drive desde la última vez que este
      // lo supo: no se sobrescribe a ciegas, se avisa para que la persona
      // decida qué versión conservar.
      ultimoConflicto = { remoteModifiedTime: remoto.modifiedTime };
      notificar({ tipo: "conflicto" });
      return;
    }
    const resultado = await guardarEnDrive(store.exportJson());
    guardarEstadoSync({ lastKnownModifiedTime: resultado.modifiedTime });
    ultimoConflicto = null;
    notificar({ tipo: "sincronizado", cuando: new Date() });
  } catch (e) {
    notificar({ tipo: "error", mensaje: e.message });
  } finally {
    sincronizando = false;
  }
}

// Resolución manual de un conflicto: "remoto" carga lo de Drive (y
// descarta los cambios locales pendientes de subir), "local" fuerza el
// guardado local por encima de lo que hay en Drive.
export async function resolverConflicto(eleccion) {
  if (eleccion === "remoto") {
    const resultado = await cargarDesdeDrive();
    if (resultado.encontrado) aplicarRemoto(resultado.contenido, resultado.modifiedTime);
  } else {
    const resultado = await guardarEnDrive(store.exportJson());
    guardarEstadoSync({ lastKnownModifiedTime: resultado.modifiedTime });
  }
  ultimoConflicto = null;
  notificar({ tipo: "sincronizado", cuando: new Date() });
}

export { haEstadoConectadoAntes };
