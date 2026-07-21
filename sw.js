const CACHE_NAME = "nwpwa-shell-v2";
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
// served forever -- reloads never re-checked the server, and since sw.js
// itself doesn't change on every deploy, the browser had no reason to even
// look for an update. Network-first fixes both: online always gets the
// current deployed files, and the cache still updates on every successful
// fetch so the offline fallback stays fresh too.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
