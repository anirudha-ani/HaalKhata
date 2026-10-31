/** The size a receipt photo is drawn at for upload, shared by the page and the HEIC worker. */

/** Pixel dimensions of an image. */
export interface ImageSize {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/**
 * The size to draw an image at so its longest edge fits `maxEdge`, keeping
 * its shape. An image that already fits keeps its size: upscaling invents
 * detail and costs bytes.
 *
 * @param size - The image's natural dimensions.
 * @param maxEdge - Longest edge allowed, in pixels.
 * @returns The size to draw at, at least one pixel on each side.
 */
export function uploadSize(size: ImageSize, maxEdge: number): ImageSize {
  const longest = Math.max(size.width, size.height);
  const ratio = longest > maxEdge ? maxEdge / longest : 1;
  return {
    // Round, then floor to at least 1: a 4000×3 panorama must not scale to a
    // zero-height canvas, which throws.
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
  };
}
