/**
 * The app's haptic vocabulary, after Apple's "Playing haptics": a success
 * when something the person did is done, an error when it was refused, a
 * selection tick when a choice changes, and a light tap for a small physical
 * action. Used sparingly; a haptic on every button stops meaning anything.
 *
 * Every call is fire-and-forget. A phone without a Taptic Engine, the
 * simulator, or Low Power Mode simply plays nothing, and that is never a
 * reason to interrupt what the person was doing.
 */

import * as Haptics from "expo-haptics";

/** Something the person asked for has finished (a code verified, requests sent). */
export function successFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** What the person tried was refused (a wrong code). */
export function errorFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}

/** A choice changed (a page settled, a switch flipped). */
export function selectionFeedback(): void {
  Haptics.selectionAsync().catch(() => undefined);
}

/** A small physical action (adding one person). */
export function tapFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
