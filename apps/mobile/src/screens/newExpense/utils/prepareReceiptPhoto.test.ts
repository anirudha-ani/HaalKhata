/** HEIC conversion, the size standard, oversized image and native-resource cleanup regression tests. */

import { beforeEach, expect, it, vi } from "vitest";
import type { ImagePickerAsset } from "expo-image-picker";
const native = vi.hoisted(() => ({
  manipulate: vi.fn(), resize: vi.fn(), renderAsync: vi.fn(), saveAsync: vi.fn(), releaseContext: vi.fn(), releaseImage: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: native.manipulate } }));
import { prepareReceiptPhoto } from "./prepareReceiptPhoto";

/**
 * A rendered image of the given size, as the native module hands back.
 * @param width Rendered width.
 * @param height Rendered height.
 * @returns The stand-in ImageRef.
 */
function renderedImage(width: number, height: number) {
  return { width, height, saveAsync: native.saveAsync, release: native.releaseImage };
}

beforeEach(() => {
  vi.clearAllMocks();
  native.manipulate.mockImplementation(() => ({ resize: native.resize, renderAsync: native.renderAsync, release: native.releaseContext }));
  native.renderAsync.mockResolvedValue(renderedImage(1932, 2576));
  native.saveAsync.mockResolvedValue({ uri: "file:///normalized.jpg", base64: "/9j/", width: 1932, height: 2576 });
});
it("converts a portrait HEIC into bounded JPEG bytes and releases native resources", async () => {
  const result = await prepareReceiptPhoto({ uri: "file:///original.heic", width: 3000, height: 4000 } as ImagePickerAsset);
  expect(native.resize).toHaveBeenCalledWith({ height: 2576 });
  expect(native.saveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.8, base64: true });
  expect(result.mediaType).toBe("image/jpeg");
  expect(native.releaseContext).toHaveBeenCalledOnce(); expect(native.releaseImage).toHaveBeenCalledOnce();
});
it("shrinks again when the picker reported the size before the photo was turned upright", async () => {
  // Reported 8064 × 6048 (landscape), so the first pass caps the width; upright it is portrait.
  native.renderAsync.mockResolvedValueOnce(renderedImage(2576, 3435)).mockResolvedValueOnce(renderedImage(1932, 2576));

  await prepareReceiptPhoto({ uri: "file:///portrait.heic", width: 8064, height: 6048 } as ImagePickerAsset);

  expect(native.resize).toHaveBeenNthCalledWith(1, { width: 2576 });
  expect(native.resize).toHaveBeenNthCalledWith(2, { height: 2576 });
  expect(native.releaseContext).toHaveBeenCalledTimes(2); expect(native.releaseImage).toHaveBeenCalledTimes(2);
});
it("refuses oversized bytes before the RPC and still releases resources", async () => {
  native.renderAsync.mockResolvedValue(renderedImage(100, 100));
  native.saveAsync.mockResolvedValue({ uri: "file:///large.jpg", base64: "a".repeat(12 * 1024 * 1024), width: 100, height: 100 });
  await expect(prepareReceiptPhoto({ uri: "file:///original.jpg", width: 100, height: 100 } as ImagePickerAsset)).rejects.toThrow("too large");
  expect(native.releaseContext).toHaveBeenCalledOnce(); expect(native.releaseImage).toHaveBeenCalledOnce();
});
