/** Converting the API's 64-bit integers: which fields hold them, and what a person sees when one cannot be carried. */

import { ScalarType } from "@bufbuild/protobuf";

/** Every 64-bit integer scalar type: these arrive as bigint and leave as bigint. */
export const LONG_SCALAR_TYPES: ReadonlySet<ScalarType> = new Set([
  ScalarType.INT64,
  ScalarType.UINT64,
  ScalarType.SINT64,
  ScalarType.FIXED64,
  ScalarType.SFIXED64,
]);

/** The unsigned ones among them, which a negative number never fits. */
export const UNSIGNED_LONG_SCALAR_TYPES: ReadonlySet<ScalarType> = new Set([ScalarType.UINT64, ScalarType.FIXED64]);

/**
 * Shown when a number typed into a form cannot be sent exactly (a fraction
 * of a cent, or a figure past 2^53 cents). The forms refuse these first;
 * this is what is left if one gets through.
 */
export const REQUEST_NUMBER_REFUSED = "That amount is larger than this app can record exactly.";

/** Shown when the server sends a figure too large for this device to show exactly. */
export const RESPONSE_NUMBER_REFUSED = "A total here is larger than this app can show exactly.";
