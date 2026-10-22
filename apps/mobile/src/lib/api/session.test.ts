/** Races between native keychain hydration, renewal, logout and account switching. */
import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock("expo-secure-store", () => storage);
vi.mock("./api.constants", () => ({ TOKEN_STORAGE_KEY: "test-session" }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  storage.getItemAsync.mockResolvedValue(null);
  storage.setItemAsync.mockResolvedValue(undefined);
  storage.deleteItemAsync.mockResolvedValue(undefined);
});

it("never restores a stored session after a concurrent sign-out", async () => {
  const pending = Promise.withResolvers<string | null>();
  storage.getItemAsync.mockReturnValue(pending.promise);
  const session = await import("./session");
  const hydrated = session.hydrateSession();
  await session.clearSession();
  pending.resolve("old-account");
  await hydrated;
  expect(session.sessionToken()).toBeNull();
});

it("never replaces a fresh login with a delayed keychain read", async () => {
  const pending = Promise.withResolvers<string | null>();
  storage.getItemAsync.mockReturnValue(pending.promise);
  const session = await import("./session");
  const hydrated = session.hydrateSession();
  await session.setSessionToken("new-account");
  pending.resolve("old-account");
  await hydrated;
  expect(session.sessionToken()).toBe("new-account");
});

it("shares one hydration read between concurrent startup callers", async () => {
  const session = await import("./session");
  await Promise.all([session.hydrateSession(), session.hydrateSession()]);
  expect(storage.getItemAsync).toHaveBeenCalledTimes(1);
});

it("orders persistent writes so a slow renewal cannot survive logout", async () => {
  const pending = Promise.withResolvers<void>();
  storage.setItemAsync.mockReturnValueOnce(pending.promise);
  const session = await import("./session");
  const renewal = session.setSessionToken("renewed");
  await Promise.resolve();
  const logout = session.clearSession();
  expect(session.sessionToken()).toBeNull();
  expect(storage.deleteItemAsync).not.toHaveBeenCalled();
  pending.resolve();
  await Promise.all([renewal, logout]);
  expect(storage.deleteItemAsync).toHaveBeenCalledOnce();
  expect(storage.setItemAsync.mock.invocationCallOrder[0]).toBeLessThan(storage.deleteItemAsync.mock.invocationCallOrder[0]);
});

it("continues queued storage work after a failed write", async () => {
  storage.setItemAsync.mockRejectedValueOnce(new Error("keychain unavailable"));
  const session = await import("./session");
  await session.setSessionToken("old-account");
  await session.clearSession();
  await session.setSessionToken("new-account");
  expect(session.sessionToken()).toBe("new-account");
  expect(storage.deleteItemAsync).toHaveBeenCalledOnce();
  expect(storage.setItemAsync).toHaveBeenLastCalledWith("test-session", "new-account");
});
