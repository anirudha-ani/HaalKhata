/** Races between native keychain hydration, renewal, logout and account switching, and what signing out leaves for the next person. */
import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock("expo-secure-store", () => storage);
vi.mock("./api.constants", () => ({ TOKEN_STORAGE_KEY: "test-session" }));
const install = vi.hoisted(() => ({ settleThisInstall: vi.fn(async () => undefined), THIS_DEVICE_ONLY: { keychainAccessible: 9 } }));
vi.mock("./thisInstall", () => install);
const savedInvite = vi.hoisted(() => ({ clearPendingInvite: vi.fn() }));
vi.mock("@/lib/invite/pendingInvite", () => savedInvite);

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  storage.getItemAsync.mockResolvedValue(null);
  storage.setItemAsync.mockResolvedValue(undefined);
  storage.deleteItemAsync.mockResolvedValue(undefined);
  savedInvite.clearPendingInvite.mockResolvedValue(undefined);
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
  expect(storage.setItemAsync).toHaveBeenLastCalledWith("test-session", "new-account", install.THIS_DEVICE_ONLY);
});

it("settles which install this is before it reads a token", async () => {
  // A token left by an earlier install must be gone before it can sign anybody in.
  const session = await import("./session");
  await session.hydrateSession();
  const [settled] = install.settleThisInstall.mock.invocationCallOrder;
  const [read] = storage.getItemAsync.mock.invocationCallOrder;
  expect(settled).toBeLessThan(read ?? 0);
});

it("drops a join link saved for the next sign-in when the session ends", async () => {
  // Saved by somebody signed out on this phone, it would otherwise wait for
  // whoever signs in next, who may be somebody else.
  const session = await import("./session");
  await session.setSessionToken("sara");
  await session.clearSession();
  expect(savedInvite.clearPendingInvite).toHaveBeenCalledOnce();
});

it("still signs out when the saved link cannot be removed", async () => {
  savedInvite.clearPendingInvite.mockRejectedValueOnce(new Error("storage unavailable"));
  const session = await import("./session");
  await session.setSessionToken("sara");
  await expect(session.clearSession()).resolves.toBeUndefined();
  expect(session.sessionToken()).toBeNull();
  expect(storage.deleteItemAsync).toHaveBeenCalledOnce();
});
