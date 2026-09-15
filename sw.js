const CACHE = "bibelplan-v12-vers-flaechen";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

async function cacheCore() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE);
}

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(cacheCore());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();

    const clients = await self.clients.matchAll({type:"window", includeUncontrolled:true});
    clients.forEach(client => client.postMessage({type:"OFFLINE_READY"}));
  })());
});

self.addEventListener("message", event => {
  if(event.data?.type === "VERIFY_OFFLINE_CACHE") {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE);
        const results = await Promise.all(CORE.map(url => cache.match(url)));
        if(results.every(Boolean) && event.source) {
          event.source.postMessage({type:"OFFLINE_READY"});
        }
      } catch (_) {}
    })());
  }
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  // Navigation: serve cached app instantly, refresh it in the background when online.
  if(req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match("./index.html") || await cache.match("./");

      const networkPromise = fetch(req).then(async response => {
        if(response && response.ok) {
          await cache.put("./index.html", response.clone());
          await cache.put("./", response.clone());
        }
        return response;
      }).catch(() => null);

      if(cached) {
        event.waitUntil(networkPromise);
        return cached;
      }

      const network = await networkPromise;
      if(network) return network;

      return new Response(
        "<h1>Bibelplan offline nicht verfügbar</h1><p>Bitte die App einmal mit Internet öffnen.</p>",
        {headers:{"Content-Type":"text/html; charset=utf-8"}}
      );
    })());
    return;
  }

  // App assets: cache first, network fallback.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if(cached) return cached;

    try {
      const response = await fetch(req);
      if(response && response.ok) await cache.put(req, response.clone());
      return response;
    } catch (_) {
      return new Response("", {status:504, statusText:"Offline"});
    }
  })());
});
