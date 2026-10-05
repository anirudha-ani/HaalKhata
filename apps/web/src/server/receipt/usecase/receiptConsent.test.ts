/** Receipt uploads cannot reach AI until the user accepts the current processor disclosure. */

import { afterEach, expect, it, vi } from "vitest";
import { parseReceipt } from "./receipt.usecase";
import { parseReceiptWithConsent, receiptProcessingInfo } from "./receiptConsent.usecase";

vi.mock("./receipt.usecase", () => ({ parseReceipt: vi.fn().mockResolvedValue({ receipt: {}, provider: "mock" }) }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("refuses missing and obsolete consent before contacting a provider", async () => {
  for (const consent of ["", "obsolete-version"]) {
    await expect(parseReceiptWithConsent(new Uint8Array([1]), consent)).rejects.toMatchObject({ code: "invalid_argument" });
  }
  expect(parseReceipt).not.toHaveBeenCalled();
});
it("allows the version that accompanied the displayed disclosure", async () => {
  await parseReceiptWithConsent(new Uint8Array([1]), receiptProcessingInfo().consentVersion);
  expect(parseReceipt).toHaveBeenCalledOnce();
});
it("requires new consent when the disclosed recipients change", async () => {
  const previous = receiptProcessingInfo().consentVersion;
  vi.stubEnv("RECEIPT_AI_PROCESSORS", "A different AI processor");
  expect(receiptProcessingInfo().consentVersion).not.toBe(previous);
  await expect(parseReceiptWithConsent(new Uint8Array([1]), previous)).rejects.toMatchObject({ code: "invalid_argument" });
  expect(parseReceipt).not.toHaveBeenCalled();
});
