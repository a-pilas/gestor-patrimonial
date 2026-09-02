const CACHE = "gestor-patrimonial-v32";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/model.js",
  "./js/store.js",
  "./js/metrics.js",
  "./js/modal.js",
  "./js/lock.js",
  "./js/dashboard.js",
  "./js/catalog.js",
  "./js/positions.js",
  "./js/movements.js",
  "./js/liabilities.js",
  "./js/fiscal.js",
  "./js/alerts.js",
  "./js/decisions.js",
  "./js/simuladores.js",
  "./js/settings.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Red primero: siempre coge la versión más reciente si hay conexión,
// y solo usa la copia local guardada cuando no hay internet.
// cache:"no-store" evita que la caché HTTP del navegador (no la de esta
// app) sirva una versión vieja sin llegar siquiera a preguntar al servidor.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
