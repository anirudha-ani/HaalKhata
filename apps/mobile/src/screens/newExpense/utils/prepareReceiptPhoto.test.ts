/** HEIC conversion, oversized image and native-resource cleanup regression tests. */

import { beforeEach, expect, it, vi } from "vitest";
import type { ImagePickerAsset } from "expo-image-picker";
const native = vi.hoisted(() => ({ resize: vi.fn(), renderAsync: vi.fn(), saveAsync: vi.fn(), releaseContext: vi.fn(), releaseImage: vi.fn() }));
vi.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: () => ({
  resize: native.resize, renderAsync: native.renderAsync, release: native.releaseContext,
}) } }));
import { prepareReceiptPhoto } from "./prepareReceiptPhoto";

beforeEach(() => {
  vi.clearAllMocks();
  native.renderAsync.mockResolvedValue({ saveAsync: native.saveAsync, release: native.releaseImage });
  native.saveAsync.mockResolvedValue({ uri: "file:///normalized.jpg", base64: "/9j/" });
});
it("converts a portrait HEIC into bounded JPEG bytes and releases native resources", async () => {
  const result = await prepareReceiptPhoto({ uri: "file:///original.heic", width: 3000, height: 4000 } as ImagePickerAsset);
  expect(native.resize).toHaveBeenCalledWith({ height: 2576 });
  expect(native.saveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.8, base64: true });
  expect(result.mediaType).toBe("image/jpeg");
  expect(native.releaseContext).toHaveBeenCalledOnce(); expect(native.releaseImage).toHaveBeenCalledOnce();
});
it("refuses oversized bytes before the RPC and still releases resources", async () => {
  native.saveAsync.mockResolvedValue({ uri: "file:///large.jpg", base64: "a".repeat(12 * 1024 * 1024) });
  await expect(prepareReceiptPhoto({ uri: "file:///original.jpg", width: 100, height: 100 } as ImagePickerAsset)).rejects.toThrow("too large");
  expect(native.releaseContext).toHaveBeenCalledOnce(); expect(native.releaseImage).toHaveBeenCalledOnce();
});
