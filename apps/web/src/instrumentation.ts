/** Next.js start-up hook: starts the in-process push worker on the Node.js runtime. */

/**
 * Called once when a server instance starts. The worker is loaded only on
 * the Node.js runtime — it needs pg and timers — and never during a build.
 * `PUSH_WORKER=off` keeps it from starting, for a process that should serve
 * requests only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.PUSH_WORKER === "off") return;
  const { startPushWorker } = await import("@/server/push/worker/pushWorker");
  startPushWorker();
}
