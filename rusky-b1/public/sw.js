// Rusky — cache des fichiers statiques sur l'appareil (connexions lentes).
// Ne met en cache QUE ce qui ne change jamais pour une URL donnée : le code et les styles de Next
// (/_next/static/, noms uniques par version), les polices et les icônes. Les pages et les données
// passent toujours par le réseau : jamais de contenu périmé, jamais de rechargement forcé.
const CACHE = "rusky-static-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Tous les autres caches, y compris ceux de l'ancienne app (pages en cache hors ligne) : sinon
      // l'appareil peut continuer d'afficher l'ancienne version.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const cacheable =
    url.pathname.startsWith("/_next/static/") || /\.(?:png|svg|ico|woff2?)$/.test(url.pathname);
  if (!cacheable) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }),
  );
});

// ---- Rappels (notifications push) -----------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = { title: "Rusky", body: "Ta séance du jour t’attend.", url: "/", tag: "rusky" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
