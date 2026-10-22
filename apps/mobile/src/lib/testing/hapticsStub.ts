/** Test-only stand-in for expo-haptics, aliased in vitest.config.ts: every call resolves and plays nothing. */

/** @returns A resolved promise. */
export async function notificationAsync(): Promise<void> {}

/** @returns A resolved promise. */
export async function impactAsync(): Promise<void> {}

/** @returns A resolved promise. */
export async function selectionAsync(): Promise<void> {}

/** Notification feedback types, as expo-haptics names them. */
export const NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" } as const;

/** Impact styles, as expo-haptics names them. */
export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy", Soft: "soft", Rigid: "rigid" } as const;
