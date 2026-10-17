/**
 * Motion tokens: the springs, durations and distances every animated surface
 * uses, so a sheet, a step change and a pressed button move with one feel.
 *
 * Springs are given as a perceptual duration plus a damping ratio (Reanimated
 * 4's form): a ratio of 1 settles without overshoot, below 1 lands with a
 * small, deliberate settle. Everything is short — Apple's guidance is that
 * motion should be brief and never hold the person up.
 */

/** How far a pressed button shrinks; enough to feel, too little to read as layout. */
export const PRESS_SCALE = 0.97;

/** Opacity of a pressed button, which is all that changes under Reduce Motion. */
export const PRESS_OPACITY = 0.88;

/** Press in and out: quick and slightly lively. */
export const PRESS_SPRING = { duration: 160, dampingRatio: 0.75 } as const;

/** A sheet rising from the bottom edge: no overshoot, so no gap opens under it. */
export const SHEET_SPRING = { duration: 340, dampingRatio: 1, overshootClamping: true } as const;

/** A centered iPad dialog grows from this scale as it fades in. */
export const DIALOG_START_SCALE = 0.94;

/** One step of a flow replacing another. */
export const STEP_SPRING_DURATION_MS = 420;

/** Damping for a step change: settles with the smallest visible landing. */
export const STEP_SPRING_DAMPING_RATIO = 0.9;

/** How far a step slides in from the side it comes from. */
export const STEP_SLIDE_DISTANCE = 36;

/** A fade that accompanies a slide, or replaces it under Reduce Motion. */
export const FADE_DURATION_MS = 220;

/** Delay between items that enter one after another. */
export const STAGGER_MS = 70;

/** A success mark popping in: a lively spring that lands once. */
export const POP_SPRING = { duration: 420, dampingRatio: 0.55 } as const;

/** How long one loop of an idle illustration takes. */
export const IDLE_LOOP_MS = 2_400;
