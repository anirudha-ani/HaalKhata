/** Bringing the part of the payment method form with the first problem into view when a save is refused. */

import { useEffect, useRef } from "react";
import type { LayoutChangeEvent, ScrollViewInstance } from "react-native";
import type { MethodFormField } from "@haalkhata/shared/payment/methodForm";
import { spacing } from "@/lib/theme/theme";

/**
 * Scrolls the sheet to the block holding the form's first problem, each time
 * a save is attempted while something is wrong.
 *
 * The bank form is taller than a phone screen and its save button is
 * pinned, so it can be pressed with the offending field far above what is
 * visible. The footer says what is wrong; this shows where.
 *
 * @param failedSaves - How many times a save has been refused; the scroll
 *   happens when this moves.
 * @param field - Which block the first problem is in; "" when there is none.
 * @returns The ref to hand the sheet's scroll view, and a factory for each
 *   block's `onLayout`, which records where the block sits.
 */
export function useScrollToFormField(failedSaves: number, field: MethodFormField | "") {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Partial<Record<MethodFormField, number>>>({});
  // The refused save that was last scrolled for. Only a new refusal moves
  // the sheet: the field changing as problems are fixed must not scroll
  // under someone who is typing.
  const handledSaves = useRef(0);

  useEffect(() => {
    if (failedSaves === handledSaves.current || field === "") return;
    handledSaves.current = failedSaves;
    const offset = offsets.current[field];
    if (offset === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - spacing.md), animated: true });
  }, [failedSaves, field]);

  /**
   * Builds the `onLayout` handler of one block.
   *
   * @param block - The part of the form the block holds.
   * @returns A handler that records the block's offset inside the scroll view.
   */
  const onFieldLayout = (block: MethodFormField) => (event: LayoutChangeEvent) => {
    offsets.current[block] = event.nativeEvent.layout.y;
  };

  return { scrollRef, onFieldLayout };
}
