/** The style a pressable button shows for how far it is pressed and whether it can be pressed at all. */

import { DISABLED_OPACITY, PRESS_OPACITY, PRESS_SCALE } from "./motion.constants";

/** What a button's animated style sets: its opacity and its scale. */
export interface PressStyle {
  opacity: number;
  transform: [{ scale: number }];
}

/**
 * Computes a button's look on the UI thread. The dim for "cannot be pressed"
 * is decided here, in the same animated style as the press, rather than by a
 * static style swapped in for it: Reanimated keeps the last values an
 * animated style wrote on the view after that style is removed, so a button
 * pressed once and then disabled kept full opacity while ignoring taps.
 *
 * @param pressed - How far the press has gone, from 0 (released) to 1 (held).
 * @param disabled - Whether the button cannot be pressed right now.
 * @param reduceMotion - Whether the person asked for less motion; the press then only dims.
 * @returns The opacity and scale to show.
 */
export function pressStyle(pressed: number, disabled: boolean, reduceMotion: boolean): PressStyle {
  "worklet";
  if (disabled) return { opacity: DISABLED_OPACITY, transform: [{ scale: 1 }] };
  return {
    opacity: 1 - pressed * (1 - PRESS_OPACITY),
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed * (1 - PRESS_SCALE) }],
  };
}
