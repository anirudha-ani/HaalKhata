/** Transport-agnostic usecase errors; api/connect maps codes to ConnectError. */

/** Machine-readable failure categories that api/connect translates into Connect status codes. */
export type UsecaseErrorCode =
  | "invalid_argument"
  | "unauthenticated"
  | "permission_denied"
  | "not_found"
  | "already_exists"
  | "unavailable";

/** Error thrown by usecases so handlers can report failures without transport knowledge. */
export class UsecaseError extends Error {
  /**
   * @param code - Failure category used to pick the matching Connect status code.
   * @param message - Human-readable explanation, safe to show to the caller.
   */
  constructor(
    public readonly code: UsecaseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UsecaseError";
  }
}

/**
 * Fails the current usecase because the caller supplied bad input.
 *
 * @param message - Human-readable explanation, safe to show to the caller.
 * @throws UsecaseError always, with code "invalid_argument".
 */
export function invalid(message: string): never {
  throw new UsecaseError("invalid_argument", message);
}

/**
 * Fails the current usecase because a referenced entity does not exist.
 *
 * @param message - Human-readable explanation, safe to show to the caller.
 * @throws UsecaseError always, with code "not_found".
 */
export function notFound(message: string): never {
  throw new UsecaseError("not_found", message);
}

/**
 * Fails the current usecase because the caller may not perform this action.
 *
 * @param message - Human-readable explanation, safe to show to the caller.
 * @throws UsecaseError always, with code "permission_denied".
 */
export function denied(message: string): never {
  throw new UsecaseError("permission_denied", message);
}
