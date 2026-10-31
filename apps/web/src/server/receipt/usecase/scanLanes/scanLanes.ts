/**
 * Who may scan a receipt right now. A server process runs a few scans at
 * once, each in a lane; when every lane is taken, a short line waits for
 * one, first come first served. A person runs one scan at a time — their
 * newest — and a scan stops as soon as the person it is for goes away, so
 * its lane goes to whoever is next instead of to a reply nobody will read.
 */

import { UsecaseError } from "@/server/common/errors";
import {
  RECEIPT_SCAN_BUSY_MESSAGE,
  RECEIPT_SCAN_LANES,
  RECEIPT_SCAN_LINE_LENGTH,
  RECEIPT_SCAN_LINE_WAIT_MS,
  RECEIPT_SCAN_REPLACED_MESSAGE,
  RECEIPT_SCAN_STOPPED_MESSAGE,
} from "@/server/receipt/receipt.constants";

/** A scan holding one lane until it is released. */
export interface ScanLane {
  /**
   * Aborts when the request goes away or the person starts another scan.
   * Everything the scan does — the provider call included — listens to it.
   */
  readonly signal: AbortSignal;
  /** Gives the lane back to whoever waits next. Calling it again does nothing. */
  release(): void;
}

/** How many lanes, how long a line, and how long to wait in it. */
export interface ScanLaneLimits {
  lanes: number;
  lineLength: number;
  waitMs: number;
}

/** A scan with a lane, or waiting for one. */
interface ScanEntry {
  userId: string;
  /** Aborted when the person's newer scan replaces this one. */
  replaced: AbortController;
}

/** A scan in line, and how to hand it a lane or turn it away. */
interface WaitingScan extends ScanEntry {
  admit(): void;
  refuse(error: Error): void;
}

/** The lanes of one process, as {@link createScanLanes} returns them. */
export interface ScanLanes {
  /**
   * Takes a lane for a person's scan, waiting in line if every lane is
   * taken. Any scan of theirs already running or waiting is stopped first.
   *
   * @param userId - Whose scan it is.
   * @param requestSignal - The request's signal: aborts when it goes away.
   * @returns The lane, to release when the scan is done.
   * @throws UsecaseError (resource_exhausted) when the line is full or the
   *   wait ran out; the scan's stop reason when the request went away first.
   */
  enter(userId: string, requestSignal: AbortSignal): Promise<ScanLane>;
  /** How many scans hold a lane and how many wait, for tests and diagnostics. */
  usage(): { running: number; waiting: number };
}

/**
 * The error a stopped scan ends with: the reason its signal carries when it
 * is one (a newer scan replaced it; the request's deadline passed), or a
 * plain "stopped" when the request simply went away.
 *
 * @param signal - The aborted signal.
 * @returns The error to throw.
 */
export function scanStoppedError(signal: AbortSignal): Error {
  return signal.reason instanceof UsecaseError ? signal.reason : new UsecaseError("aborted", RECEIPT_SCAN_STOPPED_MESSAGE);
}

/**
 * Creates one process's lanes.
 *
 * @param limits - Lanes, line length and the longest wait.
 * @returns The lanes.
 */
export function createScanLanes(limits: ScanLaneLimits): ScanLanes {
  const running = new Set<ScanEntry>();
  const line: WaitingScan[] = [];

  /**
   * Puts a scan in a lane.
   *
   * @param entry - The scan.
   * @param requestSignal - Its request's signal.
   * @returns The lane.
   */
  const occupy = (entry: ScanEntry, requestSignal: AbortSignal): ScanLane => {
    running.add(entry);
    let released = false;
    return {
      signal: AbortSignal.any([requestSignal, entry.replaced.signal]),
      release() {
        if (released) return;
        released = true;
        running.delete(entry);
        admitWaiting();
      },
    };
  };

  /** Hands free lanes to the scans waiting longest. */
  const admitWaiting = () => {
    while (running.size < limits.lanes && line.length > 0) line.shift()!.admit();
  };

  /**
   * Stops a person's scans already running or waiting: the scan they just
   * started is the one they are waiting for.
   *
   * @param userId - The person.
   */
  const replaceScansOf = (userId: string) => {
    const reason = new UsecaseError("aborted", RECEIPT_SCAN_REPLACED_MESSAGE);
    for (const entry of running) if (entry.userId === userId) entry.replaced.abort(reason);
    for (const waiting of line.filter((candidate) => candidate.userId === userId)) waiting.refuse(reason);
  };

  return {
    async enter(userId, requestSignal) {
      if (requestSignal.aborted) throw scanStoppedError(requestSignal);
      replaceScansOf(userId);
      const entry: ScanEntry = { userId, replaced: new AbortController() };
      if (running.size < limits.lanes && line.length === 0) return occupy(entry, requestSignal);
      if (line.length >= limits.lineLength) throw new UsecaseError("resource_exhausted", RECEIPT_SCAN_BUSY_MESSAGE);
      return new Promise<ScanLane>((resolve, reject) => {
        /** Leaves the line, whatever the reason, and stops listening. */
        const leave = () => {
          clearTimeout(timer);
          requestSignal.removeEventListener("abort", onRequestGone);
          const index = line.indexOf(waiting);
          if (index >= 0) line.splice(index, 1);
        };
        /** The request went away while it waited. */
        const onRequestGone = () => {
          leave();
          reject(scanStoppedError(requestSignal));
        };
        const waiting: WaitingScan = {
          ...entry,
          admit() {
            leave();
            resolve(occupy(entry, requestSignal));
          },
          refuse(error) {
            leave();
            reject(error);
          },
        };
        const timer = setTimeout(() => waiting.refuse(new UsecaseError("resource_exhausted", RECEIPT_SCAN_BUSY_MESSAGE)), limits.waitMs);
        timer.unref?.();
        requestSignal.addEventListener("abort", onRequestGone, { once: true });
        line.push(waiting);
      });
    },
    usage: () => ({ running: running.size, waiting: line.length }),
  };
}

/** This process's receipt-scan lanes. */
export const receiptScanLanes = createScanLanes({
  lanes: RECEIPT_SCAN_LANES,
  lineLength: RECEIPT_SCAN_LINE_LENGTH,
  waitMs: RECEIPT_SCAN_LINE_WAIT_MS,
});
