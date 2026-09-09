/** Regression tests for how receipt parsing reports provider outages versus unreadable photos. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sharpMock, fetchMock } = vi.hoisted(() => ({
  sharpMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("sharp", () => ({ default: sharpMock }));
vi.mock("@/server/receipt/receipt.constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/receipt/receipt.constants")>()),
  COMPATIBLE_AI: {
    baseUrl: "https://provider.test/v1",
    apiKey: "",
    model: "test-model",
    zeroDataRetention: false,
  },
}));

import { parseReceipt } from "./receipt.usecase";

/** Returns enough JPEG signature bytes for the server's format detector. */
function jpegBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff]);
}

/** Builds a successful chat-completions response whose model text is `content`. */
function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RECEIPT_AI_PROVIDERS = "compatible";
  vi.stubGlobal("fetch", fetchMock);
  const pipeline = { rotate: vi.fn(), resize: vi.fn(), jpeg: vi.fn(), toBuffer: vi.fn() };
  pipeline.rotate.mockReturnValue(pipeline);
  pipeline.resize.mockReturnValue(pipeline);
  pipeline.jpeg.mockReturnValue(pipeline);
  pipeline.toBuffer.mockResolvedValue(Buffer.from(jpegBytes()));
  sharpMock.mockReturnValue(pipeline);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("receipt provider failure reporting", () => {
  it("reports an outage, not a bad photo, when the provider rejects the request", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"code":400}}', { status: 400 }));

    await expect(parseReceipt(jpegBytes())).rejects.toMatchObject({
      code: "unavailable",
      message: expect.stringMatching(/unavailable right now/),
    });
  });

  it("reports an outage when the provider cannot be reached at all", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(parseReceipt(jpegBytes())).rejects.toMatchObject({ code: "unavailable" });
  });

  it("asks for a clearer photo only when a model read it and found no items", async () => {
    fetchMock.mockResolvedValue(completion('{"merchant":"Corner Cafe","items":[]}'));

    await expect(parseReceipt(jpegBytes())).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringMatching(/clearer photo/),
    });
  });
});
