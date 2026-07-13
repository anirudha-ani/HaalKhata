/** Minimal structured logger: JSON lines to stdout/stderr with level + context. */

/** Log severity, mapped to console methods. */
type LogLevel = "info" | "warn" | "error";

/**
 * Emits one structured JSON log line to the console (stdout for info/warn,
 * stderr for error). Keeps a flat `context` bag so callers can attach
 * request ids, user ids, etc. without a full logging dependency.
 *
 * @param level - Severity of the event.
 * @param message - Human-readable summary of the event.
 * @param context - Optional bag of structured key/value pairs to include.
 */
export function logEvent(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  const payload = { level, message, timestamp: new Date().toISOString(), ...context };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * Logs an unexpected (non-UsecaseError) error with its stack and any
 * provided context, at error level.
 *
 * @param error - The thrown value.
 * @param context - Optional bag of structured key/value pairs (e.g. RPC name).
 */
export function logError(error: unknown, context: Record<string, unknown> = {}): void {
  logEvent("error", error instanceof Error ? error.message : String(error), {
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });
}
