/**
 * Entering animations for content that arrives in order (a hero, then its
 * card, then its actions), built once at module load because Reanimated
 * re-reads a builder on every render it is passed.
 *
 * Reanimated's own Reduce Motion handling jumps an entering animation to its
 * end with no transition at all, so the reduced variants opt out of it and
 * play a short fade instead: content still arrives, it just does not move.
 */

import {
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  FadeOut,
  FadeOutLeft,
  FadeOutRight,
  FadeOutUp,
  Keyframe,
  ReduceMotion,
} from "react-native-reanimated";
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

/** Something pinned to the top edge leaving the way it came; a fade under Reduce Motion. */
export const FADE_OUT_UP = FadeOutUp.duration(FADE_DURATION_MS);

/**
 * A menu growing out of the button that opened it: a short scale from just
 * under full size with a fade, like iOS's own menus. Give the view a
 * `transformOrigin` at that button.
 */
export const MENU_POP = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.88 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(FADE_DURATION_MS);

/** The menu's entrance under Reduce Motion. */
export const MENU_FADE = FadeIn.duration(FADE_DURATION_MS).reduceMotion(ReduceMotion.Never);

/** Which way a flow is moving: on to the next step, or back to the one before. */
export type FlowDirection = "forward" | "back";

const STEP_ENTER = {
  forward: FadeInRight.springify(STEP_SPRING_DURATION_MS).dampingRatio(STEP_SPRING_DAMPING_RATIO),
  back: FadeInLeft.springify(STEP_SPRING_DURATION_MS).dampingRatio(STEP_SPRING_DAMPING_RATIO),
};

const STEP_EXIT = {
  forward: FadeOutLeft.duration(FADE_DURATION_MS),
  back: FadeOutRight.duration(FADE_DURATION_MS),
};

const STEP_FADE_IN = FadeIn.duration(FADE_DURATION_MS).reduceMotion(ReduceMotion.Never);

/**
 * How a flow's next step arrives: from the side it is coming from, settling
 * on a spring, while the old one fades the other way. A short fade under
 * Reduce Motion.
 *
 * @param direction - Forward or back.
 * @param reduceMotion - Whether Reduce Motion is on.
 * @returns The entering animation.
 */
export function stepEnter(direction: FlowDirection, reduceMotion: boolean) {
  return reduceMotion ? STEP_FADE_IN : STEP_ENTER[direction];
}

/**
 * How a flow's current step leaves.
 *
 * @param direction - Forward or back.
 * @param reduceMotion - Whether Reduce Motion is on.
 * @returns The exiting animation.
 */
export function stepExit(direction: FlowDirection, reduceMotion: boolean) {
  return reduceMotion ? FADE_OUT : STEP_EXIT[direction];
}
