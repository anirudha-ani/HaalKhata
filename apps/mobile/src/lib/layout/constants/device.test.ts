/** Duo adjustments require an explicit native capability, never a wide window. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({ platform: "ios", native: { isDuo: true } as { isDuo?: boolean } | null }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => device.native }));
vi.mock("react-native", () => ({ Platform: { get OS() { return device.platform; } } }));

beforeEach(() => vi.resetModules());

describe("Duo-only adjustments", () => {
  it.each([
    ["Duo, open or folded", "ios", { isDuo: true }, true],
    ["ordinary iPhone", "ios", { isDuo: false }, false],
    ["iPad", "ios", { isDuo: false }, false],
    ["older native build", "ios", {}, false],
    ["missing module", "ios", null, false],
    ["Android", "android", { isDuo: true }, false],
  ])("%s", async (_name, platform, native, expected) => {
    Object.assign(device, { platform, native });
    expect((await import("./device")).IS_IPHONE_DUO).toBe(expected);
  });
});
