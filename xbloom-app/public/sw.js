// Offline shell for the installed app. Network first so updates land straight away;
// the cache only answers when the phone is offline. API and cross-origin calls pass through.
const CACHE = "xbai-v23";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "studio.js", "recipe-engine.js",
  "xbloom-web.js", "xbloom-ble.js", "reference-recipes.json", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "logo.svg", "favicon-32.png", "apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))),
  );
});
