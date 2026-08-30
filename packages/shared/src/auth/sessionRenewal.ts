/** The response header that carries a renewed bearer token to the mobile transport. */

/**
 * Set by the server on any authenticated RPC once the caller's session has
 * used up more than half its lifetime. Browsers get the same renewal as a
 * fresh cookie instead; the mobile interceptor reads this header and replaces
 * the stored token, so an app in regular use is never signed out by the
 * absolute token lifetime.
 */
export const SESSION_RENEWAL_HEADER = "x-haalkhata-session";
