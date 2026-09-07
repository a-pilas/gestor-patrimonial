// Acceso a Google Drive: llamadas de bajo nivel a la API + gestión del
// token de Google Identity Services. La orquestación de cuándo sincronizar
// (al abrir, tras cada cambio, detección de conflictos) vive en sync.js —
// este módulo solo sabe hablar con Drive.
//
// Alcance mínimo (drive.file): la app solo puede ver y tocar los ficheros
// que ella misma crea en tu Drive, nunca el resto de tus documentos. El
// token de acceso vive solo en memoria de esta pestaña, nunca se guarda —
// lo único que se guarda en localStorage es un simple "sí/no" de si este
// navegador se ha conectado alguna vez, para saber si merece la pena
// intentar una reconexión silenciosa al abrir la app.

const CLIENT_ID = "831479772789-30cgf616a909eeqru1o5aun7dk60f16k.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "gestor-patrimonial-datos.json";
const CONECTADO_ANTES_KEY = "gestorPatrimonial:driveConectadoAntes";

let tokenClient = null;
let accessToken = null;

export function haEstadoConectadoAntes() {
  return localStorage.getItem(CONECTADO_ANTES_KEY) === "1";
}

function marcarConectado() {
  localStorage.setItem(CONECTADO_ANTES_KEY, "1");
}

export function olvidarConexion() {
  localStorage.removeItem(CONECTADO_ANTES_KEY);
  accessToken = null;
}

export function tieneTokenEnMemoria() {
  return !!accessToken;
}

function ensureTokenClient() {
  if (!window.google?.accounts?.oauth2) {
    throw new Error("La librería de Google todavía no ha cargado. Comprueba tu conexión e inténtalo de nuevo en un momento.");
  }
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // se sobrescribe en cada llamada
    });
  }
  return tokenClient;
}

function pedirToken(prompt) {
  return new Promise((resolve, reject) => {
    const client = ensureTokenClient();
    client.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      accessToken = resp.access_token;
      marcarConectado();
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt });
  });
}

// Conexión explícita a petición del usuario (botón "Conectar con Drive" o
// las acciones manuales de Ajustes): siempre deja elegir cuenta, para que
// nunca intente adivinar cuál de varias sesiones activas usar.
export function conectarInteractivo() {
  if (accessToken) return Promise.resolve(accessToken);
  return pedirToken("select_account");
}

// Intento de reconexión SIN interacción, para el arranque de la app en un
// dispositivo que ya se conectó alguna vez. No garantiza éxito (depende de
// que Google mantenga la sesión activa) y nunca debe bloquear el arranque:
// se resuelve a null en cualquier fallo, nunca lanza ni deja colgada la
// promesa más de unos segundos.
export function conectarSilencioso() {
  if (accessToken) return Promise.resolve(accessToken);
  if (!haEstadoConectadoAntes()) return Promise.resolve(null);
  return Promise.race([
    pedirToken("").catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
  ]);
}

async function driveFetch(url, options = {}) {
  const token = await getAccessTokenOrThrow();
  const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    accessToken = null;
    const retryToken = await getAccessTokenOrThrow();
    return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${retryToken}` } });
  }
  return res;
}

function getAccessTokenOrThrow() {
  if (accessToken) return Promise.resolve(accessToken);
  return pedirToken("select_account");
}

// Busca el fichero de datos entre los que la app ha creado en Drive (el
// alcance drive.file hace que esta búsqueda nunca vea nada más).
async function buscarFichero() {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `name='${FILE_NAME}' and trashed=false`
  )}&spaces=drive&fields=files(id,modifiedTime)`;
  const res = await driveFetch(url);
  if (!res.ok) throw new Error(`No se pudo consultar Drive (${res.status}).`);
  const json = await res.json();
  return json.files?.[0] || null;
}

// Metadatos únicamente (sin descargar contenido) — para comprobar si algo
// ha cambiado en Drive desde la última vez que este dispositivo lo vio,
// sin gastar ancho de banda ni tiempo en traer el JSON entero solo para eso.
export async function obtenerMetadatosRemotos() {
  return buscarFichero();
}

export async function guardarEnDrive(contenidoJson) {
  const existente = await buscarFichero();
  if (existente) {
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existente.id}?uploadType=media&fields=id,modifiedTime`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: contenidoJson,
      }
    );
    if (!res.ok) throw new Error(`No se pudo actualizar el fichero en Drive (${res.status}).`);
    const json = await res.json();
    return { modo: "actualizado", modifiedTime: json.modifiedTime };
  }

  const boundary = "gestor-patrimonial-boundary";
  const metadata = { name: FILE_NAME, mimeType: "application/json" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${contenidoJson}\r\n` +
    `--${boundary}--`;
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`No se pudo crear el fichero en Drive (${res.status}).`);
  const json = await res.json();
  return { modo: "creado", modifiedTime: json.modifiedTime };
}

export async function cargarDesdeDrive() {
  const existente = await buscarFichero();
  if (!existente) return { encontrado: false };
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${existente.id}?alt=media`);
  if (!res.ok) throw new Error(`No se pudo descargar el fichero de Drive (${res.status}).`);
  const contenido = await res.text();
  return { encontrado: true, contenido, modifiedTime: existente.modifiedTime };
}
