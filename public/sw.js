/**
 * LeadWell service worker — hand-rolled so the PWA needs no build plugin.
 *
 * Vite fingerprints its bundles, so there is no build-time asset list to
 * precache. Instead: cache the shell on install, then cache hashed assets as
 * they are requested. Because the filename changes when the content does, a
 * cache-first read of a hashed asset is always correct.
 *
 * Bump CACHE_VERSION to evict every cache on the next deploy.
 */
const CACHE_VERSION = "v1";
const SHELL_CACHE = `leadwell-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `leadwell-assets-${CACHE_VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE];

const SHELL_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is atomic: one 404 would leave us with no shell at all.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("leadwell-") && !KNOWN_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** The page asks for an immediate takeover after it registers an update. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

const isAsset = (request, url) =>
  ["script", "style", "font", "image", "manifest"].includes(request.destination) ||
  /\.(js|css|woff2?|ttf|png|jpe?g|svg|webp|ico|json)$/.test(url.pathname);

/** Network-first: the app shell must not go stale behind a deploy. */
async function shellFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put("/", response.clone());
    return response;
  } catch {
    return (
      (await cache.match("/")) ??
      (await cache.match("/offline.html")) ??
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}

/** Cache-first with a background refresh — safe because assets are hashed. */
async function assetFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const response = await network;
  if (response) return response;
  throw new Error("asset unavailable offline");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase and the AI endpoints are same-session state, never cacheable.
  if (url.origin !== self.location.origin) {
    // Google Fonts is the one cross-origin resource worth keeping offline.
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      event.respondWith(assetFirst(request));
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(shellFirst(request));
    return;
  }

  if (isAsset(request, url)) {
    event.respondWith(assetFirst(request));
  }
});
