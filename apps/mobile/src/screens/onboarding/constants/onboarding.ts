/** Sizes and timings for the first-run flow. */

/** How far the code boxes shake on a wrong code. */
export const CODE_SHAKE_DISTANCE = 8;

/** Size of the art above each step's title. */
export const STEP_ART_SIZE = 112;

/** When each sample notification drops in on the notifications step, in milliseconds. */
export const PREVIEW_BANNER_DELAYS_MS = [260, 820] as const;

/** When each "On HaalKhata" badge pops in on the find-friends art, by row, in milliseconds. */
export const CONTACTS_BADGE_DELAYS_MS = [520, 680, 840] as const;

/** Diameter of the closing step's check. */
export const SUCCESS_MARK_SIZE = 92;

/** The check lands this long after its disc. */
export const SUCCESS_TICK_DELAY_MS = 160;

/** The ring behind the check starts this long after the disc. */
export const SUCCESS_RIPPLE_DELAY_MS = 120;

/** How long the ring behind the check takes to spread and fade. */
export const SUCCESS_RIPPLE_MS = 900;
