/**
 * The background sweep that removes operation claims past retention. It runs
 * on a timer in the web process, never inside a money transaction: a write
 * that cleared out old claims itself held them locked until it committed, so
 * every other money write that reached the same claims waited behind it, and
 * two writes taking those and the ledger locks in opposite orders deadlocked.
 */

import { isMigrated } from "@/server/common/db/db";
import { logError } from "@/server/common/logger";
import {
  OPERATION_SWEEP_BATCH_SIZE,
  OPERATION_SWEEP_INTERVAL_MS,
  OPERATION_SWEEP_MAX_BATCHES,
} from "./operations.constants";
import { pruneExpiredOperations } from "./operations.repo";

/** A running sweep. */
interface OperationsSweep {
  stop(): void;
}

// One sweep per process, even across dev-server hot reloads.
const sweepCache = globalThis as unknown as { __haalkhataOperationsSweep?: OperationsSweep };

/**
 * Removes expired claims in batches until a batch comes back short or the
 * per-sweep limit is reached; whatever is left goes on the next sweep.
 *
 * @returns How many claims this sweep removed.
 */
export async function sweepExpiredOperations(): Promise<number> {
  let removed = 0;
  for (let batch = 0; batch < OPERATION_SWEEP_MAX_BATCHES; batch++) {
    const count = await pruneExpiredOperations(OPERATION_SWEEP_BATCH_SIZE);
    removed += count;
    if (count < OPERATION_SWEEP_BATCH_SIZE) break;
  }
  return removed;
}

/**
 * Starts the sweep once per process; later calls do nothing.
 *
 * It never migrates: a pass waits until the app has, and the first request
 * or readiness probe does that. Sweeps run one at a time, and each catches
 * its own errors — a failed sweep leaves the rows for the next one, and
 * nothing here may take the web process down. Several processes can sweep
 * at once; each skips the rows another is removing.
 */
export function startOperationsSweep(): void {
  if (sweepCache.__haalkhataOperationsSweep) return;
  let sweeping = false;

  /** Runs one sweep unless one is already running or the schema is not ready. */
  const sweep = async (): Promise<void> => {
    if (sweeping || !isMigrated()) return;
    sweeping = true;
    try {
      await sweepExpiredOperations();
    } catch (error) {
      logError(error, { scope: "operations-sweep" });
    } finally {
      sweeping = false;
    }
  };

  const timer = setInterval(() => void sweep(), OPERATION_SWEEP_INTERVAL_MS);
  timer.unref();
  const sweepInstance: OperationsSweep = {
    stop() {
      clearInterval(timer);
    },
  };
  sweepCache.__haalkhataOperationsSweep = sweepInstance;
  process.once("SIGTERM", () => sweepInstance.stop());
}
