/** Shared native window, content and dialog dimensions. */

/**
 * Viewport width at which persistent tablet navigation replaces bottom tabs.
 * It sits where iOS moves from compact to regular width: an iPhone Duo's
 * inner display held upright (669 points) and an iPad mini in portrait (744)
 * get the tablet layout, while the Duo's outer display (466), any iPhone held
 * upright and half of an 11-inch iPad (590) keep the phone layout. Held
 * sideways, a phone is wide and short, and the rail suits it better than tabs
 * along a short bottom edge: every iPhone held sideways gets it, the Duo's
 * outer display (678) included.
 */
export const TABLET_BREAKPOINT = 640;

/**
 * Viewport width at which the content beside the rail gets tablet density:
 * a friend's amounts beside their name, insight cards in pairs, the welcome
 * story beside its sign-in card, wider margins. A tablet window narrower than
 * this (the Duo's inner display held upright, an iPad mini in portrait) keeps
 * the rail but lays its content out as a phone does, because beside the rail
 * it has only 512 to 639 points, about a phone's width.
 */
export const SPACIOUS_LAYOUT_BREAKPOINT = 768;

/** Viewport width at which screens have room for side-by-side content columns. */
export const EXPANDED_LAYOUT_BREAKPOINT = 1024;

/** Maximum readable width for the standard screen canvas. */
export const SCREEN_CONTENT_MAX_WIDTH = 1180;

/** Maximum width for focused authentication and onboarding forms. */
export const FOCUSED_CONTENT_MAX_WIDTH = 520;

/** Maximum width for a tablet dialog presented by the shared Sheet component. */
export const TABLET_SHEET_MAX_WIDTH = 640;

/** Text scaling at which dense controls need a stacked layout. */
export const LARGE_TEXT_SCALE = 1.3;

/** Smallest fraction of its size a detail header's title may shrink to before it is cut short. */
export const HEADER_TITLE_MIN_SCALE = 0.8;
