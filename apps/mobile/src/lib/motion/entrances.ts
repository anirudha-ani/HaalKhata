/**
 * Entering animations for content that arrives in order (a hero, then its
 * card, then its actions), built once at module load because Reanimated
 * re-reads a builder on every render it is passed.
 *
 * Reanimated's own Reduce Motion handling jumps an entering animation to its
 * end with no transition at all, so the reduced variants opt out of it and
 * play a short fade instead: content still arrives, it just does not move.
 */

import { FadeIn, FadeInDown, FadeInUp, FadeOut, ReduceMotion } from "react-native-reanimated";
import {
  FADE_DURATION_MS,
  STAGGER_MS,
  STEP_SPRING_DAMPING_RATIO,
  STEP_SPRING_DURATION_MS,
} from "./motion.constants";

/** Most positions in one staggered entrance. */
const MAX_ORDER = 8;

const ORDERS = Array.from({ length: MAX_ORDER }, (_unused, order) => order);

const RISE = ORDERS.map((order) =>
  FadeInDown.springify(STEP_SPRING_DURATION_MS).dampingRatio(STEP_SPRING_DAMPING_RATIO).delay(order * STAGGER_MS),
);

const DROP = ORDERS.map((order) =>
  FadeInUp.springify(STEP_SPRING_DURATION_MS).dampingRatio(STEP_SPRING_DAMPING_RATIO).delay(order * STAGGER_MS),
);

const FADE = ORDERS.map((order) =>
  FadeIn.duration(FADE_DURATION_MS).delay(order * STAGGER_MS).reduceMotion(ReduceMotion.Never),
);

/**
 * Clamps a stagger position into the prebuilt range.
 *
 * @param order - Position in the entrance, from 0.
 * @returns A valid index.
 */
function slot(order: number): number {
  return Math.min(Math.max(0, Math.round(order)), MAX_ORDER - 1);
}

/**
 * Rises a little into place, one stagger step after the item before it.
 *
 * @param order - Position in the entrance, from 0.
 * @param reduceMotion - Whether Reduce Motion is on.
 * @returns The entering animation.
 */
export function riseIn(order: number, reduceMotion: boolean) {
  return reduceMotion ? FADE[slot(order)] : RISE[slot(order)];
}

/**
 * Drops a little into place, for content that belongs to the top edge.
 *
 * @param order - Position in the entrance, from 0.
 * @param reduceMotion - Whether Reduce Motion is on.
 * @returns The entering animation.
 */
export function dropIn(order: number, reduceMotion: boolean) {
  return reduceMotion ? FADE[slot(order)] : DROP[slot(order)];
}

/** A quick fade out, the same with or without Reduce Motion. */
export const FADE_OUT = FadeOut.duration(FADE_DURATION_MS).reduceMotion(ReduceMotion.Never);
