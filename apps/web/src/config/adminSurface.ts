/**
 * Which surface a request is on: the app everyone uses, or the operator's
 * admin page. Shared by the page proxy, the Connect mount and the admin
 * handlers, so all three give the same answer to the same request.
 *
 * The admin page is served from its own hostname (ADMIN_HOST, in production
 * admin.haalkhata.app) by the same server as the app. Two things follow
 * from keeping them on separate origins rather than separate paths:
 *
 * - A page on one cannot read the other. They are different origins and
 *   nothing here sends a CORS header, so a script running on the app's
 *   origin cannot read an admin response. It could still *send* a request:
 *   the two hostnames are the same site, so the browser would attach the
 *   admin cookie and SameSite would not object. What refuses that request
 *   is the Origin check every admin RPC makes for itself
 *   (api/connect/adminRequest.ts), which is why that check is not optional
 *   and why this host must never grow a CORS header.
 * - Each origin serves only its own half. The admin host shows what users
 *   typed only where someone reported it, in the moderation queue, and the
 *   app host has no admin page or admin API to probe.
 *
 * The Host header is the caller's to choose, so none of this is the access
 * control: that is the admin session, checked on every admin RPC. This file
 * only decides which half of the server a hostname reaches.
 */

/** The admin page's route inside the Next app. */
export const ADMIN_PAGE_PATH = "/admin";

/**
 * Path prefixes of the admin services under the Connect mount: the usage
 * overview and the moderation queue. On the admin host these are the only
 * RPCs that exist, and on the app host they are the only ones that do not.
 */
export const ADMIN_RPC_PREFIXES = [
  "/api/connect/adminanalytics.v1.AdminAnalyticsService/",
  "/api/connect/adminmoderation.v1.AdminModerationService/",
] as const;

/**
 * What a hostname serves. "both" exists only outside production, where
 * there is one localhost and no second hostname to put the admin page on.
 */
export type RequestSurface = "app" | "admin" | "both";

/** What the page proxy should do with a request. */
export type PageVerdict = "serve" | "not-found";

/**
 * Strips a port from a Host header value.
 *
 * @param host - Lowercased Host value, possibly with a port or IPv6 brackets.
 * @returns The hostname alone.
 */
function hostnameOf(host: string): string {
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  const portSeparator = host.lastIndexOf(":");
  return portSeparator === -1 ? host : host.slice(0, portSeparator);
}

/**
 * Decides which surface a request's Host header names.
 *
 * With ADMIN_HOST set, exactly that hostname is the admin surface and every
 * other hostname is the app. ADMIN_HOST may carry a port, in which case the
 * port must match too. With it unset, production has no admin surface at
 * all (the page and its API do not exist), and development serves both from
 * whatever host it runs on.
 *
 * @param hostHeader - The request's Host header.
 * @param environment - Process environment; injected for tests.
 * @returns The surface this request is on.
 */
export function requestSurface(
  hostHeader: string | null | undefined,
  environment: Record<string, string | undefined> = process.env,
): RequestSurface {
  const adminHost = (environment.ADMIN_HOST ?? "").trim().toLowerCase();
  if (adminHost === "") return environment.NODE_ENV === "production" ? "app" : "both";

  const requestHost = (hostHeader ?? "").trim().toLowerCase();
  const matches = adminHost.includes(":")
    ? requestHost === adminHost
    : hostnameOf(requestHost) === adminHost;
  return matches ? "admin" : "app";
}

/**
 * Whether a path is the admin page or something under it.
 *
 * @param pathname - URL pathname of the request.
 * @returns True for "/admin" and "/admin/...".
 */
function isAdminPagePath(pathname: string): boolean {
  return pathname === ADMIN_PAGE_PATH || pathname.startsWith(`${ADMIN_PAGE_PATH}/`);
}

/**
 * Decides what a page request, or a request to an API route outside the
 * Connect mount, gets on its surface.
 *
 * On the admin host only the admin page exists, plus the root, which the
 * root route turns into a redirect to it: no app page and no app API route
 * (health, the mobile release check, Apple's callback) answers there. On
 * the app host the admin page does not exist. Everything else is a 404 rather than a redirect, in both
 * directions, so that neither hostname ever hands a visitor across to the
 * other. This is about keeping the two apart, not about hiding the admin
 * page: its hostname is in this repository for anyone to read.
 *
 * The root is redirected by the route rather than rewritten here. A proxy
 * rewrite is resolved against the address the server is bound to, and when
 * that differs from the URL the proxy was handed (as it does on a server
 * bound to 127.0.0.1) Next treats the rewrite as a hop to another origin
 * and the request comes back in under the wrong hostname.
 *
 * @param pathname - URL pathname of the page request.
 * @param hostHeader - The request's Host header.
 * @param environment - Process environment; injected for tests.
 * @returns Serve as is, or answer 404.
 */
export function pageVerdict(
  pathname: string,
  hostHeader: string | null | undefined,
  environment: Record<string, string | undefined> = process.env,
): PageVerdict {
  const surface = requestSurface(hostHeader, environment);
  if (surface === "both") return "serve";
  if (surface === "admin") {
    return pathname === "/" || pathname === ADMIN_PAGE_PATH ? "serve" : "not-found";
  }
  return isAdminPagePath(pathname) ? "not-found" : "serve";
}

/**
 * Whether an RPC may be served on the surface it arrived on: only the admin
 * services on the admin host, everything but the admin services on the app.
 *
 * The Connect adapter matches the raw path exactly, so today a path with
 * dot segments reaches no handler at all. The path is normalized here
 * anyway, so that this check does not quietly depend on a router or proxy
 * in front of it never starting to resolve "/x/../admin..." on its own.
 *
 * @param requestUrl - The request's path and query, as Node hands it over.
 * @param hostHeader - The request's Host header.
 * @param environment - Process environment; injected for tests.
 * @returns True when the RPC belongs on this surface.
 */
export function rpcAllowedOnSurface(
  requestUrl: string | undefined,
  hostHeader: string | null | undefined,
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const surface = requestSurface(hostHeader, environment);
  if (surface === "both") return true;

  let pathname: string;
  try {
    pathname = new URL(requestUrl ?? "", "http://internal.invalid").pathname;
  } catch {
    return false;
  }
  const isAdminRpc = ADMIN_RPC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  return surface === "admin" ? isAdminRpc : !isAdminRpc;
}
