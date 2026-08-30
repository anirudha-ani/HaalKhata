/** The response header that carries a renewed bearer token to the mobile transport. */

/**
 * Set by the server on any authenticated RPC once the caller's session has
 * used up more than half its lifetime. Browsers get the same renewal as a
 * fresh cookie instead; the mobile interceptor reads this header and replaces
 * the stored token, so an app in regular use is never signed out by the
 * absolute token lifetime.
 */
export const SESSION_RENEWAL_HEADER = "x-haalkhata-session";

/**
 * Request header a client sets to say how it carries its session. The
 * sign-in RPCs return the bearer token only when this names bearer
 * transport; a browser, which keeps its session in an HttpOnly cookie,
 * never gets bearer material in a JSON body.
 */
export const SESSION_TRANSPORT_HEADER = "x-haalkhata-session-transport";

/** The value of {@link SESSION_TRANSPORT_HEADER} for a bearer-token client. */
export const BEARER_TRANSPORT = "bearer";
