/** Verifies privacy preferences and the data sent over the real provider request boundary. */

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jpegWith } from "./image/testing/jpegSegments";
import { scanReceipt } from "./receipt.usecase";

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  configuration: { baseUrl: "https://openrouter.ai/api/v1", apiKey: "", model: "google/gemini-3-flash-preview", zeroDataRetention: true },
}));
vi.mock("../receipt.constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../receipt.constants")>()), COMPATIBLE_AI: state.configuration,
}));
vi.mock("../repo/receiptScans.repo", () => ({ insertReceiptScan: vi.fn(async () => undefined) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RECEIPT_AI_PROVIDERS", "compatible");
  vi.stubGlobal("fetch", state.fetch);
  state.configuration.zeroDataRetention = true;
  state.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ merchant: "Cafe", items: [{ name: "Tea", quantity: 1, total: "3.00" }] }),
  } }] })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("places ZDR and no-training preferences where OpenRouter enforces them", async () => {
  await scanReceipt("private-account-identifier", jpegWith({ width: 1200, height: 1600 }));
  expect(state.fetch).toHaveBeenCalledOnce();
  const [endpoint, request] = state.fetch.mock.calls[0];
  expect(endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
  const payload = JSON.parse(request.body);
  expect(payload.provider).toEqual({ zdr: true, data_collection: "deny" });
  expect(payload).not.toHaveProperty("zdr");
  expect(request.body).not.toContain("private-account-identifier");
  expect(payload.messages).toHaveLength(1);
  expect(payload.messages[0].content).toEqual([
    { type: "image_url", image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } },
    { type: "text", text: expect.any(String) },
  ]);
});

it("omits OpenRouter preferences when using a compatible endpoint without that capability", async () => {
  state.configuration.zeroDataRetention = false;
  await scanReceipt("private-account-identifier", jpegWith({ width: 1200, height: 1600 }));
  expect(JSON.parse(state.fetch.mock.calls[0][1].body)).not.toHaveProperty("provider");
});
