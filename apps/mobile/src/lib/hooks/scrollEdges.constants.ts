/** Constants for the scroll-edge hook. */

/**
 * Slack, in points, when deciding whether a scroll view is at an edge.
 * Fractional offsets and sub-point sizes mean "at the end" is rarely an
 * exact equality.
 */
export const SCROLL_EDGE_TOLERANCE = 1;

/** How often, in milliseconds, scroll events reach the hook while a finger is down. */
export const SCROLL_EVENT_THROTTLE_MS = 32;
