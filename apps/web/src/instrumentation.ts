/**
 * Next.js start-up hook: on the Node.js runtime, checks the SMS provider's
 * code length, starts the sweep of expired operation claims and starts the
 * in-process push worker.
 */

/**
 * Called once when a server instance starts. All are loaded only on the
 * Node.js runtime (they need pg and timers), never during a build. The
 * code-length check runs in the background and only logs. The claims sweep
 * always runs: money writes no longer clear old claims themselves.
 * `PUSH_WORKER=off` keeps the push worker from starting, for a process that
 * should serve requests only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportCodeLengthMismatch } = await import("@/server/auth/usecase/phone/phoneVerification");
  void reportCodeLengthMismatch();
  const { startOperationsSweep } = await import("@/server/common/ledger/operationsSweep");
  startOperationsSweep();
  if (process.env.PUSH_WORKER === "off") return;
  const { startPushWorker } = await import("@/server/push/worker/pushWorker");
  startPushWorker();
}
