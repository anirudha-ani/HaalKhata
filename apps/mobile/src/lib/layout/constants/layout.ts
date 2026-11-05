/** Shared native window, content and dialog dimensions. */

/**
 * Smallest window width, in points, for the large-window layout: the
 * navigation rail beside the content, centred dialogs and wrapped category
 * chips. Any phone held upright (at most 440 wide), iPhone Duo's outer display
 * (466) and half of an 11-inch iPad (590) stay below it; iPhone Duo's inner
 * display held upright (669) and an iPad mini in portrait (744) clear it.
 *
 * This is a width in points, not iOS's horizontal size class. iOS calls an
 * iPhone held sideways compact at any width and half of a 13-inch iPad
 * compact too, so swapping one rule for the other would move the navigation
 * on both.
 */
export const LARGE_WINDOW_MIN_WIDTH = 640;

/**
 * Smallest window height, in points, for the large-window layout. A phone
 * held sideways is wide but short (375 to 440 points, iPhone Duo's outer
 * display 466): five rail items at a large text size run past its bottom
 * edge, and a centred dialog has no room left once the keyboard is up. Such a
 * window keeps bottom tabs and bottom sheets, as iOS's own apps do on a phone
 * held sideways. Every iPad window and iPhone Duo's inner display (669 tall
 * held wide) clear it.
 */
export const LARGE_WINDOW_MIN_HEIGHT = 600;

/** Width of the navigation rail, before it grows by the safe-area inset on its side. */
export const NAVIGATION_RAIL_WIDTH = 128;

/**
 * Width, in points, the content needs for tablet density: a friend's amounts
 * beside their name, insight cards in pairs, the welcome story beside its
 * sign-in card, wider margins. It is measured after the rail and the safe-area
 * insets on both sides, so it is the room the content really has. An iPad in
 * portrait has 692 or more and iPhone Duo's inner display held wide 739, while
 * the Duo held upright (541) and an iPad mini in portrait (616) keep a
 * phone's density beside the rail.
 */
export const SPACIOUS_CONTENT_MIN_WIDTH = 640;

/** Viewport width at which screens have room for side-by-side content columns. */
export const EXPANDED_LAYOUT_BREAKPOINT = 1024;

/** Maximum readable width for the standard screen canvas. */
export const SCREEN_CONTENT_MAX_WIDTH = 1180;

/** Maximum width for focused authentication and onboarding forms. */
export const FOCUSED_CONTENT_MAX_WIDTH = 520;

/** Maximum width for a dialog the shared Sheet centres in a large window. */
export const CENTERED_SHEET_MAX_WIDTH = 640;

/** Text scaling at which dense controls need a stacked layout. */
export const LARGE_TEXT_SCALE = 1.3;

/** Smallest fraction of its size a detail header's title may shrink to before it is cut short. */
export const HEADER_TITLE_MIN_SCALE = 0.8;
