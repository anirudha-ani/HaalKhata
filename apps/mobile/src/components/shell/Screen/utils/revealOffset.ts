/** Where to scroll a screen so a block that grew is on screen again — pure. */

/** Where a block sits and how much of the screen shows, in points. */
export interface RevealGeometry {
  /** The block's top inside the scrolled content. */
  contentTop: number;
  /** Its top measured from the top of the visible part of the scroll view. */
  visibleTop: number;
  /** The block's height. */
  height: number;
  /** The height of the visible part of the scroll view. */
  viewportHeight: number;
  /** The gap to keep between the block and the edge it is brought to. */
  margin: number;
}

/**
 * Works out the scroll offset that brings a block's bottom back into view,
 * moving the screen only as far as it must. A block taller than the screen
 * keeps its top in view instead, and one that already fits, or sits above
 * what is visible, is left where it is.
 *
 * @param geometry - Where the block sits and how much of the screen shows.
 * @returns The offset to scroll to, or null when no scroll is needed.
 */
export function revealOffset({ contentTop, visibleTop, height, viewportHeight, margin }: RevealGeometry): number | null {
  const pastBottom = visibleTop + height + margin - viewportHeight;
  const distance = Math.min(pastBottom, visibleTop - margin);
  if (distance <= 0) return null;
  // The block's content position less its visible position is where the
  // screen is scrolled to now.
  return contentTop - visibleTop + distance;
}
