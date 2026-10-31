/** Unit tests for the size a receipt photo is drawn at for upload. */

import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_IMAGE_EDGE_PIXELS } from "@haalkhata/shared/receipt/receipt.constants";
import { uploadSize } from "@/lib/image/imageSize";

describe("uploadSize", () => {
  it("shrinks a phone photo to the longest edge the server accepts", () => {
    expect(uploadSize({ width: 4032, height: 3024 }, 2576)).toEqual({ width: 2576, height: 1932 });
    expect(uploadSize({ width: 8064, height: 6048 }, 2576)).toEqual({ width: 2576, height: 1932 });
  });

  it("scales by the longest edge whichever way the photo is turned", () => {
    expect(uploadSize({ width: 3024, height: 4032 }, 2576)).toEqual({ width: 1932, height: 2576 });
  });

  it("keeps a photo that already fits at its own size and never enlarges", () => {
    expect(uploadSize({ width: 1200, height: 900 }, 2576)).toEqual({ width: 1200, height: 900 });
    expect(uploadSize({ width: 2576, height: 100 }, 2576)).toEqual({ width: 2576, height: 100 });
  });

  it("keeps a sliver of an image at least one pixel tall", () => {
    // A 4000x3 panorama scaled by 2576/4000 rounds the height to 2, not 0 —
    // a zero-height canvas throws on drawImage.
    expect(uploadSize({ width: 4000, height: 3 }, 2576).height).toBeGreaterThanOrEqual(1);
    expect(uploadSize({ width: 0, height: 0 }, 2576)).toEqual({ width: 1, height: 1 });
  });

  it("never comes out larger than the standard on either side", () => {
    for (const [width, height] of [[16320, 12240], [2577, 2577], [99_999, 3]]) {
      const size = uploadSize({ width, height }, MAX_RECEIPT_IMAGE_EDGE_PIXELS);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAX_RECEIPT_IMAGE_EDGE_PIXELS);
    }
  });
});
