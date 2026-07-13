/**
 * Runtime polyfills for APIs the Connect transport needs that Hermes does not
 * ship: TextEncoder/TextDecoder (used to serialize proto JSON to bytes).
 * Imported first thing from the app entry point, before any transport code.
 */

import "fast-text-encoding";
