/** Transport-layer constants: session cookie settings and error-code mapping. */

import { Code } from "@connectrpc/connect";
import type { UsecaseErrorCode } from "@/server/common/errors";

/** Name of the HTTP cookie that carries the web client's session token. */
export const SESSION_COOKIE = "hk_token";

/** Session cookie lifetime in seconds (30 days), matching the token lifetime. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Lookup from UsecaseErrorCode to the equivalent Connect status code. */
export const CODE_MAP: Record<UsecaseErrorCode, Code> = {
  invalid_argument: Code.InvalidArgument,
  unauthenticated: Code.Unauthenticated,
  permission_denied: Code.PermissionDenied,
  not_found: Code.NotFound,
  already_exists: Code.AlreadyExists,
};
