const CACHE_NAME = "nwpwa-shell-v3";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./src/nws.js",
  "./src/pollen.js",
  "./src/geocode.js",
  "./src/location.js",
  "./src/chart.js",
  "./vendor/uplot.iife.min.js",
  "./vendor/uplot.min.css",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// App shell: network-first, falling back to cache only when the fetch fails
// (offline). v1 was cache-first, which meant the very first cached copy was
// served forever. v2 fixed that but called plain fetch(), which still honors
// GitHub Pages' `Cache-Control: max-age=600` on JS/CSS -- so the browser's own
// HTTP cache could silently hand back a stale response for up to 10 minutes,
// even though the SW *thought* it was going to the network. `cache: "reload"`
// forces a real conditional request to the server every time, bypassing that
// HTTP cache entirely, so "network-first" actually means "always current"
// when online.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "reload" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
