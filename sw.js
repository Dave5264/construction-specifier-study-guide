/* Construction Specifier Study Guide service worker — offline-first app shell */
const CACHE = "spec-guide-v14";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./questions.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  // cache the new version, but DON'T auto-activate — wait for the user to tap "Refresh"
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// the page asks us to activate the new version when the user taps Refresh
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
