/** How the Connect router is mounted; shared by the Next API route and the tests that exercise it. */

import type { ConnectRouterOptions } from "@connectrpc/connect";
import { DEFAULT_READ_MAX_BYTES } from "../connect.constants";
import { requireSignedSession } from "../context";

/**
 * The options every RPC is served with, unless its service overrides them in
 * routes.ts. All three exist because a request is otherwise read, unzipped
 * and decoded before any of the app's own code runs:
 *
 * - `readMaxBytes` caps the request after decompression, so a few
 *   compressed bytes cannot expand past it.
 * - `readUnknownFields: false` drops fields no message defines while
 *   decoding instead of keeping each as an object; the app never reads them,
 *   and kept, a few megabytes of them cost about a gigabyte.
 * - `requestGate` runs before the body is read: a call that needs a session
 *   is refused without one, so an anonymous request costs its headers.
 */
export const CONNECT_MOUNT_OPTIONS: Partial<ConnectRouterOptions> = {
  readMaxBytes: DEFAULT_READ_MAX_BYTES,
  binaryOptions: { readUnknownFields: false },
  requestGate: requireSignedSession,
};
