/**
 * Next.js start-up hook: on the Node.js runtime, checks the SMS provider's
 * code length and starts the in-process push worker.
 */

/**
 * Called once when a server instance starts. Both are loaded only on the
 * Node.js runtime (the worker needs pg and timers), never during a build.
 * The code-length check runs in the background and only logs. `PUSH_WORKER=off`
 * keeps the worker from starting, for a process that should serve requests
 * only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportCodeLengthMismatch } = await import("@/server/auth/usecase/phone/phoneVerification");
  void reportCodeLengthMismatch();
  if (process.env.PUSH_WORKER === "off") return;
  const { startPushWorker } = await import("@/server/push/worker/pushWorker");
  startPushWorker();
}
