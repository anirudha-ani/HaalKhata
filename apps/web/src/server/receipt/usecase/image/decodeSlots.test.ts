/** Tests for the decode slots: who runs together, who waits, and in what order. */

import { describe, expect, it } from "vitest";
import { IMAGE_DECODE_SLOTS } from "@/server/receipt/receipt.constants";
import { withDecodeSlots } from "./decodeSlots";

/** A decode the test lets finish when it chooses. */
interface HeldDecode {
  /** Settles once the decode has run. */
  done: Promise<void>;
  /** Whether the decode has started. */
  started: () => boolean;
  /** Lets it finish. */
  release: () => void;
}

/**
 * Starts a decode that holds its slots until released.
 *
 * @param slots - Slots it asks for.
 * @param order - Where it records starting, by name.
 * @param name - Its name in `order`.
 * @returns Controls for it.
 */
function holdDecode(slots: number, order: string[], name: string): HeldDecode {
  let release = () => {};
  let started = false;
  const done = withDecodeSlots(slots, () => {
    started = true;
    order.push(name);
    return new Promise<void>((resolve) => { release = resolve; });
  });
  return { done, started: () => started, release: () => release() };
}

/** Lets queued promise callbacks run. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round++) await Promise.resolve();
}

describe("withDecodeSlots", () => {
  it("runs two ordinary decodes at once", async () => {
    const order: string[] = [];
    const first = holdDecode(1, order, "first");
    const second = holdDecode(1, order, "second");
    await settle();

    expect(order).toEqual(["first", "second"]);
    first.release();
    second.release();
    await Promise.all([first.done, second.done]);
  });

  it("starts a decode that needs every slot only once the others finish, and nothing beside it", async () => {
    const order: string[] = [];
    const ordinary = holdDecode(1, order, "ordinary");
    const heic = holdDecode(IMAGE_DECODE_SLOTS, order, "heic");
    const later = holdDecode(1, order, "later");
    await settle();

    // One slot is free, but the HEIC came first and needs both, so the later
    // image waits behind it rather than overtaking it.
    expect(order).toEqual(["ordinary"]);
    ordinary.release();
    await ordinary.done;
    await settle();
    expect(order).toEqual(["ordinary", "heic"]);
    expect(later.started()).toBe(false);

    heic.release();
    await heic.done;
    await settle();
    expect(order).toEqual(["ordinary", "heic", "later"]);
    later.release();
    await later.done;
  });

  it("gives the slots back when a decode fails", async () => {
    await expect(withDecodeSlots(IMAGE_DECODE_SLOTS, async () => {
      throw new Error("decoder failed");
    })).rejects.toThrow("decoder failed");

    const order: string[] = [];
    const after = holdDecode(IMAGE_DECODE_SLOTS, order, "after");
    await settle();
    expect(order).toEqual(["after"]);
    after.release();
    await after.done;
  });

  it("treats asking for more slots than exist as asking for all of them", async () => {
    await expect(withDecodeSlots(IMAGE_DECODE_SLOTS + 5, async () => "ran")).resolves.toBe("ran");
  });
});
