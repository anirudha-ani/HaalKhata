/* HaalKhata service worker: static-asset cache + network-first navigation. */

// Bump this when the precache asset set changes. HTML routes are NOT
// precached (see SHELL below) so new deploys ship fresh HTML immediately,
// which references new Next-hashed JS/CSS chunks — assets self-invalidate
// via their hashed filenames, so a manual bump is rarely needed.
const CACHE_VERSION = "haalkhata-v2";
const CACHE = CACHE_VERSION;

// Only static, content-hashed assets are precached. HTML routes (e.g.
// /dashboard) are deliberately excluded: precaching them serves a stale
// login-redirect or authed shell to logged-out users, and a cached HTML
// document references old asset hashes, defeating cache-busting on deploy.
const SHELL = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheKeys) =>
        Promise.all(cacheKeys.filter((cacheKey) => cacheKey !== CACHE).map((cacheKey) => caches.delete(cacheKey))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Never cache API calls or non-GET requests.
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;

  // Navigation requests (HTML documents) are always network-first so a new
  // deploy's HTML ships immediately; offline, fall back to the cached shell
  // only when one exists (no precached HTML to serve stale).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached ?? caches.match("/manifest.webmanifest"))),
    );
    return;
  }

  // Static assets: network-first, cache the response when it's from our origin.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

/* Web Push scaffold (Phase 4 — needs VAPID keys + push_subscriptions). */

/**
 * Returns an origin-relative notification destination or a safe fallback.
 * Push payloads and stored Notification.data are untrusted: requiring an
 * initial single slash blocks absolute URLs, custom schemes and protocol-
 * relative URLs, while URL parsing catches backslash and normalization tricks.
 */
function safeNotificationPath(candidate) {
  const fallback = "/dashboard";
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  try {
    const destination = new URL(candidate, self.location.origin);
    if (destination.origin !== self.location.origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const pushData = event.data.json();
  event.waitUntil(
    self.registration.showNotification(pushData.title ?? "HaalKhata", {
      body: pushData.body ?? "",
      icon: "/icon-192.png",
      data: { link: safeNotificationPath(pushData.link) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(safeNotificationPath(event.notification.data?.link)));
});
