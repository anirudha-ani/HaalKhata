/** @vitest-environment jsdom */
/** The first-use dialog names recipients and exposes explicit permission and manual-entry actions. */

import { create } from "@bufbuild/protobuf";
import { ReceiptProcessingInfoSchema } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ReceiptConsentPrompt } from "./ReceiptConsentPrompt";

it("shows future-account scope and grants only when Allow is clicked", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const consent = { prompt: create(ReceiptProcessingInfoSchema, { disclosure: "Receipt photos are sent to OpenRouter and Google (Gemini)." }),
    busy: false, error: "", request: vi.fn(), allow: vi.fn(), decline: vi.fn() };
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(ReceiptConsentPrompt, { consent })));
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Allow AI receipt scanning?");
    expect(container.textContent).toContain("OpenRouter and Google (Gemini)");
    expect(container.textContent).toContain("future scans on this account");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    const buttons = Array.from(container.querySelectorAll("button"));
    await act(async () => { buttons.find((button) => button.textContent === "Enter manually")!.click(); });
    expect(consent.decline).toHaveBeenCalledOnce(); expect(consent.allow).not.toHaveBeenCalled();
    await act(async () => { buttons.find((button) => button.textContent === "Allow AI scanning")!.click(); });
    expect(consent.allow).toHaveBeenCalledOnce();
  } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
