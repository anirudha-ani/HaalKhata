/**
 * The process's budget for unpacking receipt images: a fixed number of slots,
 * handed out in arrival order. Decoding is where a receipt scan uses its
 * memory, so this, not the number of scans, is what keeps two scans from
 * unpacking more than the container has.
 */

import { IMAGE_DECODE_SLOTS } from "@/server/receipt/receipt.constants";

/** A decode waiting for slots, in arrival order. */
interface WaitingDecode {
  /** Slots it needs. */
  slots: number;
  /** Lets it start. */
  start: () => void;
}

/** Slots held by decodes running now. */
let slotsInUse = 0;

/** Decodes waiting their turn, oldest first. */
const waiting: WaitingDecode[] = [];

/**
 * Starts waiting decodes, oldest first, while the oldest one fits. One that
 * does not fit holds back those behind it, so a HEIC that needs every slot is
 * not overtaken forever by smaller images.
 */
function startWaiting(): void {
  while (waiting.length > 0 && slotsInUse + waiting[0].slots <= IMAGE_DECODE_SLOTS) {
    const next = waiting.shift()!;
    slotsInUse += next.slots;
    next.start();
  }
}

/**
 * Runs a decode once it holds the slots it needs, and gives them back when it
 * finishes or fails.
 *
 * @param slots - Slots the decode needs; more than the budget counts as all of it.
 * @param operation - The decode.
 * @returns The decode's result.
 */
export async function withDecodeSlots<Result>(slots: number, operation: () => Promise<Result>): Promise<Result> {
  const needed = Math.min(Math.max(1, slots), IMAGE_DECODE_SLOTS);
  await new Promise<void>((start) => {
    waiting.push({ slots: needed, start });
    startWaiting();
  });
  try {
    return await operation();
  } finally {
    slotsInUse -= needed;
    startWaiting();
  }
}
