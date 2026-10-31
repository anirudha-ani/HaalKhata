/** A device is named well enough to recognise, from a description that may be hostile. */

import { describe, expect, it } from "vitest";
import { appLabel, browserLabel } from "./deviceLabel";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const EDGE_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const SAMSUNG_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36";

describe("naming a browser", () => {
  it.each([
    [CHROME_MAC, "Chrome on Mac"],
    [EDGE_WINDOWS, "Edge on Windows"],
    [FIREFOX_LINUX, "Firefox on Linux"],
    [SAFARI_IPHONE, "Safari on iPhone"],
    [CHROME_IPHONE, "Chrome on iPhone"],
    [SAMSUNG_ANDROID, "Samsung Internet on Android"],
  ])("reads %s", (userAgent, label) => {
    expect(browserLabel(userAgent)).toBe(label);
  });

  it("says what it can from half a description", () => {
    expect(browserLabel("Firefox/131.0")).toBe("Firefox");
    expect(browserLabel("(Macintosh)")).toBe("Mac");
  });

  it("falls back when there is nothing to go on", () => {
    expect(browserLabel(null)).toBe("A browser");
    expect(browserLabel("curl/8.0")).toBe("A browser");
  });

  it("reads only the start of a description of any size, quickly", () => {
    const started = performance.now();

    expect(browserLabel("A".repeat(50_000_000))).toBe("A browser");
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("naming a phone", () => {
  it("keeps a model name as it is", () => {
    expect(appLabel("iPhone 15 Pro")).toBe("iPhone 15 Pro");
    expect(appLabel("SM-S918B")).toBe("SM-S918B");
  });

  it("calls a phone that says nothing the app", () => {
    expect(appLabel(null)).toBe("HaalKhata app");
    expect(appLabel("   ")).toBe("HaalKhata app");
  });

  it("drops markup and control characters, which have no place in a model name", () => {
    expect(appLabel("<b>Pixel\n8</b>")).toBe("bPixel8b");
  });

  it("is never longer than the column", () => {
    expect(appLabel("x".repeat(5000)).length).toBeLessThanOrEqual(80);
  });
});
