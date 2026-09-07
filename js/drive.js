// Copia de seguridad manual en Google Drive: dos botones ("Guardar en
// Drive" y "Cargar desde Drive"), sin sincronización automática — con datos
// financieros preferimos que tú decidas cuándo subir/bajar, en vez de
// arriesgarnos a un sobrescrito silencioso si algún día usas la app desde
// dos sitios a la vez.
//
// Alcance mínimo (drive.file): la app solo puede ver y tocar los ficheros
// que ella misma crea en tu Drive, nunca el resto de tus documentos. El
// token de acceso vive solo en memoria de esta pestaña, nunca se guarda.

const CLIENT_ID = "831479772789-30cgf616a909eeqru1o5aun7dk60f16k.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "gestor-patrimonial-datos.json";

let tokenClient = null;
let accessToken = null;

function ensureTokenClient() {
  if (!window.google?.accounts?.oauth2) {
    throw new Error("La librería de Google todavía no ha cargado. Comprueba tu conexión e inténtalo de nuevo en un momento.");
  }
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // se sobrescribe en cada llamada a getAccessToken()
    });
  }
  return tokenClient;
}

// Pide un token de acceso — si ya hay uno en memoria de esta pestaña lo
// reutiliza; si no, abre el selector de cuenta de Google (prompt:
// "select_account" a propósito, para que siempre puedas elegir qué cuenta
// usar si hay varias sesiones activas en el navegador, en vez de que Google
// intente una silenciosa con la que le parezca y deniegue sin más).
function getAccessToken() {
  return new Promise((resolve, reject) => {
    const client = ensureTokenClient();
    if (accessToken) {
      resolve(accessToken);
      return;
    }
    client.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      accessToken = resp.access_token;
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt: "select_account" });
  });
}

async function driveFetch(url, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    // Token caducado o revocado: se descarta y se reintenta una vez, pidiendo uno nuevo.
    accessToken = null;
    const retryToken = await getAccessToken();
    return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${retryToken}` } });
  }
  return res;
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

export async function guardarEnDrive(contenidoJson) {
  const existente = await buscarFichero();
  if (existente) {
    const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existente.id}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: contenidoJson,
    });
    if (!res.ok) throw new Error(`No se pudo actualizar el fichero en Drive (${res.status}).`);
    return { modo: "actualizado" };
  }

  const boundary = "gestor-patrimonial-boundary";
  const metadata = { name: FILE_NAME, mimeType: "application/json" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${contenidoJson}\r\n` +
    `--${boundary}--`;
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`No se pudo crear el fichero en Drive (${res.status}).`);
  return { modo: "creado" };
}

export async function cargarDesdeDrive() {
  const existente = await buscarFichero();
  if (!existente) return { encontrado: false };
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${existente.id}?alt=media`);
  if (!res.ok) throw new Error(`No se pudo descargar el fichero de Drive (${res.status}).`);
  const contenido = await res.text();
  return { encontrado: true, contenido, modifiedTime: existente.modifiedTime };
}
