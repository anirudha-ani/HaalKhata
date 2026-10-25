/** @vitest-environment jsdom */
/** Tests that the Google script loader resolves with the SDK or says why it cannot. */

import { afterEach, expect, it, vi } from "vitest";
import {
  GOOGLE_SCRIPT_ELEMENT_ID,
  GOOGLE_SCRIPT_FAILED_MESSAGE,
  GOOGLE_SDK_MISSING_MESSAGE,
  type GoogleIdentityServices,
} from "./googleIdentity.constants";
import { loadGoogleScript } from "./loadGoogleScript";

/** @returns A stand-in for the SDK the script defines. */
function fakeSdk(): GoogleIdentityServices {
  return { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
}

/** @returns The injected script tag. */
function injectedScript(): HTMLElement {
  return document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID)!;
}

afterEach(() => {
  injectedScript()?.remove();
  delete window.google;
});

it("resolves with the SDK the script defines", async () => {
  const loading = loadGoogleScript();
  const identityServices = fakeSdk();
  window.google = identityServices;
  injectedScript().dispatchEvent(new Event("load"));

  await expect(loading).resolves.toBe(identityServices);
});

it("rejects when the script runs without defining the SDK, and lets a retry load it afresh", async () => {
  const first = loadGoogleScript();
  // Strict mode mounts twice: the second load waits on the same tag.
  const second = loadGoogleScript();
  const blocked = injectedScript();
  blocked.dispatchEvent(new Event("load"));

  await expect(first).rejects.toThrow(GOOGLE_SDK_MISSING_MESSAGE);
  await expect(second).rejects.toThrow(GOOGLE_SDK_MISSING_MESSAGE);
  expect(blocked.isConnected).toBe(false);

  const retry = loadGoogleScript();
  expect(injectedScript()).not.toBe(blocked);
  const identityServices = fakeSdk();
  window.google = identityServices;
  injectedScript().dispatchEvent(new Event("load"));
  await expect(retry).resolves.toBe(identityServices);
});

it("rejects when the script fails to download", async () => {
  const loading = loadGoogleScript();
  injectedScript().dispatchEvent(new Event("error"));

  await expect(loading).rejects.toThrow(GOOGLE_SCRIPT_FAILED_MESSAGE);
  expect(document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID)).toBeNull();
});
