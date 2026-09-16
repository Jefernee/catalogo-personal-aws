// Service worker minimo: cachea el shell para que la app abra sin conexion.
// Los datos siempre se piden a la API, nunca se sirven de cache.
//
// Al navegar se pide la pagina saltando la cache HTTP del navegador: GitHub
// Pages sirve el HTML con max-age, y sin esto una version nueva podia tardar
// minutos en verse. La cache queda solo como respaldo para cuando no hay red.
const CACHE = "catalogo-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  const esNavegacion = e.request.mode === "navigate";

  e.respondWith(
    fetch(esNavegacion ? new Request(e.request, { cache: "reload" }) : e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
