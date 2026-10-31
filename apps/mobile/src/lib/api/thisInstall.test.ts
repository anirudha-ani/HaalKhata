/** A reinstall does not come back signed in; an app update never signs anybody out. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const keychain = vi.hoisted(() => ({
  entries: new Map<string, { value: string; options?: object }>(),
}));
const installation = vi.hoisted(() => ({ time: vi.fn<() => Promise<Date>>() }));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 9,
  getItemAsync: async (storageKey: string) => keychain.entries.get(storageKey)?.value ?? null,
  setItemAsync: async (storageKey: string, value: string, options?: object) => void keychain.entries.set(storageKey, { value, options }),
  deleteItemAsync: async (storageKey: string) => void keychain.entries.delete(storageKey),
}));
vi.mock("expo-application", () => ({ getInstallationTimeAsync: installation.time }));
vi.mock("./api.constants", () => ({
  INSTALL_DATE_DRIFT_MS: 60_000,
  INSTALL_MARKER_STORAGE_KEY: "install",
  TOKEN_STORAGE_KEY: "token",
  UNFINISHED_SIGN_OUT_STORAGE_KEY: "unfinished",
}));

const { isSameInstall, settleThisInstall } = await import("./thisInstall");

const FIRST_INSTALL = new Date("2026-10-01T10:00:00Z");
const REINSTALL = new Date("2026-10-30T10:00:00Z");
const value = (storageKey: string) => keychain.entries.get(storageKey)?.value;

beforeEach(() => {
  keychain.entries.clear();
  installation.time.mockReset();
  installation.time.mockResolvedValue(FIRST_INSTALL);
});

describe("settleThisInstall", () => {
  it("keeps everybody signed in on the first launch of this version", async () => {
    keychain.entries.set("token", { value: "session" });

    await settleThisInstall();

    expect(value("token")).toBe("session");
  });

  it("seals a token saved before this version to this device", async () => {
    keychain.entries.set("token", { value: "session" });

    await settleThisInstall();

    expect(keychain.entries.get("token")?.options).toEqual({ keychainAccessible: 9 });
  });

  it("notes the install from then on", async () => {
    await settleThisInstall();

    expect(value("install")).toBe(String(FIRST_INSTALL.getTime()));
  });

  it("leaves the session alone across an app update, which keeps the install date", async () => {
    await settleThisInstall();
    keychain.entries.set("token", { value: "session" });

    await settleThisInstall();

    expect(value("token")).toBe("session");
    expect(value("unfinished")).toBeUndefined();
  });

  it("does not come back signed in after the app was deleted and installed again", async () => {
    await settleThisInstall();
    keychain.entries.set("token", { value: "session" });
    installation.time.mockResolvedValue(REINSTALL);

    await settleThisInstall();

    expect(value("token")).toBeUndefined();
  });

  it("hands that session to the server to end, so no ghost device stays listed", async () => {
    await settleThisInstall();
    keychain.entries.set("token", { value: "session" });
    installation.time.mockResolvedValue(REINSTALL);

    await settleThisInstall();

    expect(value("unfinished")).toBe("session");
  });

  it("treats the new install as the current one afterwards", async () => {
    await settleThisInstall();
    installation.time.mockResolvedValue(REINSTALL);
    await settleThisInstall();
    keychain.entries.set("token", { value: "signed in again" });

    await settleThisInstall();

    expect(value("token")).toBe("signed in again");
  });

  it("never signs anybody out because the check could not run", async () => {
    keychain.entries.set("token", { value: "session" });
    installation.time.mockRejectedValue(new Error("no documents folder"));

    await expect(settleThisInstall()).resolves.toBeUndefined();

    expect(value("token")).toBe("session");
  });
});

describe("isSameInstall", () => {
  it("allows for a little drift in the date", () => {
    expect(isSameInstall(String(FIRST_INSTALL.getTime() + 500), FIRST_INSTALL.getTime())).toBe(true);
  });

  it("does not take a later install for the same one", () => {
    expect(isSameInstall(String(FIRST_INSTALL.getTime()), REINSTALL.getTime())).toBe(false);
  });
});
