/** Saved receipt permission is account-specific, revocable, and bound to material sharing changes. */

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { scanReceipt } from "./receipt.usecase";
import { grantReceiptConsent, getReceiptProcessingInfo, parseReceiptWithConsent, receiptProcessingInfo, revokeReceiptConsent } from "./receiptConsent.usecase";

const state = vi.hoisted(() => ({ saved: new Map<string, string>(),
  configuration: { baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-3-flash-preview", zeroDataRetention: true } }));
vi.mock("../receipt.constants", () => ({ COMPATIBLE_AI: state.configuration }));
vi.mock("../repo/receiptConsent.repo", () => ({
  findReceiptConsent: async (userId: string) => state.saved.get(userId),
  saveReceiptConsent: async (userId: string, version: string) => { state.saved.set(userId, version); },
  removeReceiptConsent: async (userId: string) => { state.saved.delete(userId); },
}));
vi.mock("./receipt.usecase", () => ({ scanReceipt: vi.fn().mockResolvedValue({ receipt: {}, provider: "mock" }) }));
beforeEach(() => {
  state.saved.clear();
  Object.assign(state.configuration, { baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-3-flash-preview", zeroDataRetention: true });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("does not treat knowledge of the public version as account permission", async () => {
  const information = await getReceiptProcessingInfo("first-account");
  expect(information.consentGranted).toBe(false);
  await expect(parseReceiptWithConsent("first-account", new Uint8Array([1]), information.consentVersion))
    .rejects.toMatchObject({ code: "failed_precondition" });
  expect(scanReceipt).not.toHaveBeenCalled();
});
it("remembers one explicit allowance across different receipts and client sessions", async () => {
  const version = receiptProcessingInfo().consentVersion;
  await grantReceiptConsent("first-account", version);
  expect((await getReceiptProcessingInfo("first-account")).consentGranted).toBe(true);
  await parseReceiptWithConsent("first-account", new Uint8Array([1]), version);
  await parseReceiptWithConsent("first-account", new Uint8Array([2]), version);
  expect(scanReceipt).toHaveBeenCalledTimes(2);
  expect((await getReceiptProcessingInfo("other-account")).consentGranted).toBe(false);
  await expect(parseReceiptWithConsent("other-account", new Uint8Array([3]), version)).rejects.toMatchObject({ code: "failed_precondition" });
});
it("withdrawal blocks another device even if it sends the previously accepted version", async () => {
  const version = receiptProcessingInfo().consentVersion;
  await grantReceiptConsent("first-account", version);
  expect((await revokeReceiptConsent("first-account")).consentGranted).toBe(false);
  await expect(parseReceiptWithConsent("first-account", new Uint8Array([1]), version)).rejects.toMatchObject({ code: "failed_precondition" });
  expect(scanReceipt).not.toHaveBeenCalled();
  await grantReceiptConsent("first-account", version);
  await parseReceiptWithConsent("first-account", new Uint8Array([1]), version);
  expect(scanReceipt).toHaveBeenCalledOnce();
});
it("refuses missing and obsolete grant versions without saving permission", async () => {
  for (const version of ["", "obsolete-version"]) {
    await expect(grantReceiptConsent("first-account", version)).rejects.toMatchObject({ code: "failed_precondition" });
  }
  expect(state.saved.size).toBe(0);
});
it.each(["recipients", "gateway", "model-provider", "retention", "routing"])("requires fresh consent after a %s change", async (change) => {
  const version = receiptProcessingInfo().consentVersion;
  await grantReceiptConsent("first-account", version);
  if (change === "recipients") vi.stubEnv("RECEIPT_AI_PROCESSORS", "Another processor");
  if (change === "gateway") state.configuration.baseUrl = "https://other.example/api/v1";
  if (change === "model-provider") state.configuration.model = "another-provider/vision";
  if (change === "retention") state.configuration.zeroDataRetention = false;
  if (change === "routing") vi.stubEnv("RECEIPT_AI_PROVIDERS", "compatible");
  expect((await getReceiptProcessingInfo("first-account")).consentGranted).toBe(false);
  await expect(parseReceiptWithConsent("first-account", new Uint8Array([1]), version)).rejects.toMatchObject({ code: "failed_precondition" });
  await expect(grantReceiptConsent("first-account", version)).rejects.toMatchObject({ code: "failed_precondition" });
  expect(scanReceipt).not.toHaveBeenCalled();
});
it("keeps permission for routine model upgrades with the same recipients and terms", async () => {
  const version = receiptProcessingInfo().consentVersion;
  await grantReceiptConsent("first-account", version);
  state.configuration.model = "google/gemini-new-version";
  expect((await getReceiptProcessingInfo("first-account")).consentGranted).toBe(true);
  await parseReceiptWithConsent("first-account", new Uint8Array([1]), version);
  expect(scanReceipt).toHaveBeenCalledOnce();
});
it("hands a permitted scan the account and currency, so the attempt is counted against that account", async () => {
  const version = receiptProcessingInfo().consentVersion;
  await grantReceiptConsent("first-account", version);
  const image = new Uint8Array([1]);
  await parseReceiptWithConsent("first-account", image, version, "EUR");
  expect(scanReceipt).toHaveBeenCalledExactlyOnceWith("first-account", image, "EUR");
});
