/**
 * The background sweep that finishes live splits when their time is up, so a
 * split nobody ends still gets its summary, on a timer in the web process.
 */

import { isMigrated } from "@/server/common/db/db";
import { logError } from "@/server/common/logger";
import { LIVE_SPLIT_SWEEP_INTERVAL_MS } from "@/server/expense/expense.constants";
import { finishDueLiveSplits } from "./liveSplit.usecase";

/** A running sweep. */
interface LiveSplitSweep {
  stop(): void;
}

// One sweep per process, even across dev-server hot reloads.
const sweepCache = globalThis as unknown as { __haalkhataLiveSplitSweep?: LiveSplitSweep };

/**
 * Starts the sweep once per process; later calls do nothing. It waits until
 * the app has migrated, passes run one at a time, and each catches its own
 * errors: nothing here may take the web process down.
 */
export function startLiveSplitSweep(): void {
  if (sweepCache.__haalkhataLiveSplitSweep) return;
  let sweeping = false;

  /** Runs one pass unless one is already running or the schema is not ready. */
  const sweep = async (): Promise<void> => {
    if (sweeping || !isMigrated()) return;
    sweeping = true;
    try {
      await finishDueLiveSplits();
    } catch (error) {
      logError(error, { scope: "live-split-sweep" });
    } finally {
      sweeping = false;
    }
  };

  const timer = setInterval(() => void sweep(), LIVE_SPLIT_SWEEP_INTERVAL_MS);
  timer.unref();
  sweepCache.__haalkhataLiveSplitSweep = { stop: () => clearInterval(timer) };
}
