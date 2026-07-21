const CACHE_NAME = "nwpwa-shell-v1";
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

// App shell: cache-first. API calls (weather.gov, pollen proxy, zippopotam) are
// left to hit the network directly — app.js/localStorage already handle the
// stale-data fallback for those, and caching live forecast data here would just
// duplicate that logic with a different staleness policy.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
