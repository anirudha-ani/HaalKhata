/** The push worker inside the web process: wakes on commit, sweeps on a timer, reads receipts, stops on shutdown. */

import { isMigrated } from "@/server/common/db/db";
import { listen, type Subscription } from "@/server/common/db/listen";
import { logError, logEvent } from "@/server/common/logger";
import {
  PUSH_BATCH_SIZE,
  PUSH_NOTIFY_CHANNEL,
  PUSH_RECEIPT_INTERVAL_MS,
  PUSH_SWEEP_INTERVAL_MS,
} from "@/server/push/push.constants";
import { drainPushOutbox } from "@/server/push/usecase/dispatch/dispatch.usecase";
import { checkPushReceipts } from "@/server/push/usecase/receipts/receipts.usecase";

/** A running worker. */
interface PushWorker {
  stop(): Promise<void>;
}

// One worker per process, even across dev-server hot reloads.
const workerCache = globalThis as unknown as { __haalkhataPushWorker?: PushWorker };

/**
 * Starts the worker once per process; later calls do nothing.
 *
 * Drains run one at a time: a wake-up that arrives mid-drain queues one more
 * pass instead of a second concurrent one, and a full batch loops at once.
 * Every pass and timer catches its own errors — a failed pass leaves its rows
 * leased and they come back on a later one; nothing here may take the web
 * process down.
 *
 * The worker never migrates. Migrations run on the first API request or
 * readiness probe, and passes wait until they have; a push is only queued by
 * a request, which migrates first, so nothing waits on this in practice.
 * LISTEN starts at once and reconnects by itself, so a database that is down
 * at boot delays wake-ups only until it is back, not until the next restart.
 */
export function startPushWorker(): void {
  if (workerCache.__haalkhataPushWorker) return;
  let draining = false;
  let wakeAgain = false;
  let stopped = false;

  /** Runs passes until a pass claims less than a full batch and nothing woke it meanwhile. */
  const drain = async (): Promise<void> => {
    if (stopped) return;
    if (draining) {
      wakeAgain = true;
      return;
    }
    if (!isMigrated()) return;
    draining = true;
    try {
      let report;
      do {
        wakeAgain = false;
        report = await drainPushOutbox();
      } while (!stopped && (report.claimed === PUSH_BATCH_SIZE || wakeAgain));
    } catch (error) {
      logError(error, { scope: "push-drain" });
    } finally {
      draining = false;
    }
  };

  /** Reads receipts that are ready. */
  const readReceipts = async (): Promise<void> => {
    if (stopped || !isMigrated()) return;
    try {
      await checkPushReceipts();
    } catch (error) {
      logError(error, { scope: "push-receipts" });
    }
  };

  const sweepTimer = setInterval(() => void drain(), PUSH_SWEEP_INTERVAL_MS);
  const receiptTimer = setInterval(() => void readReceipts(), PUSH_RECEIPT_INTERVAL_MS);
  sweepTimer.unref();
  receiptTimer.unref();

  const subscription: Subscription = listen(PUSH_NOTIFY_CHANNEL, () => void drain());

  const worker: PushWorker = {
    async stop() {
      stopped = true;
      clearInterval(sweepTimer);
      clearInterval(receiptTimer);
      await subscription.close();
    },
  };
  workerCache.__haalkhataPushWorker = worker;
  // Docker sends SIGTERM and waits ten seconds. Stop taking new work; a batch
  // already in flight either finishes or comes back when its lease lapses.
  process.once("SIGTERM", () => void worker.stop());
  logEvent("info", "push worker started", { channel: PUSH_NOTIFY_CHANNEL });
}
