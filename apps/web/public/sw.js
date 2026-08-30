/* HaalKhata service worker: cache-first for hashed build assets and the shell files, nothing else. */

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

// What the worker may cache: content-hashed build assets and the shell
// files precached above. Nothing else. The previous handler cached every
// same-origin GET that was not /api/ or a navigation, which quietly included
// React Server Component payloads and prefetches — responses that depend on
// who is signed in — and kept them across sign-out. An allowlist cannot make
// that mistake: a URL is either a hashed asset, which is safe for anyone and
// self-invalidates by name, or it is never touched.
const CACHEABLE_PREFIXES = ["/_next/static/"];

/**
 * Whether a request is for a static asset this worker may serve from cache.
 * Same origin, GET, and either a hashed build asset or one of the shell
 * files. RSC requests are excluded twice over: they never live under
 * /_next/static/, and the `RSC` header / `_rsc` query would refuse them
 * anyway should that ever change.
 */
function isCacheableAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return false;
  if (SHELL.includes(url.pathname)) return true;
  return CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Navigations, API calls, RSC payloads, data requests: straight to the
  // network, with nothing stored. Not intercepting is the whole point —
  // there is no offline shell to serve stale, and no account-dependent
  // response ever lands in the cache.
  if (!isCacheableAsset(request)) return;

  // Cache-first for hashed assets: the name changes when the content does,
  // so a cached copy is never wrong, only occasionally absent.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
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
