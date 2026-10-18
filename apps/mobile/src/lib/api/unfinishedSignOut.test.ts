/** Tests for finishing a sign-out that could not reach the server. */

import { Code, ConnectError } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ storage: new Map<string, string>(), logOut: vi.fn() }));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (storageKey: string) => native.storage.get(storageKey) ?? null),
  setItemAsync: vi.fn(async (storageKey: string, value: string) => void native.storage.set(storageKey, value)),
  deleteItemAsync: vi.fn(async (storageKey: string) => void native.storage.delete(storageKey)),
}));
vi.mock("./connect", () => ({ authClient: { logOut: native.logOut } }));
// The real constants module reads the platform and build config at import.
vi.mock("./api.constants", () => ({ UNFINISHED_SIGN_OUT_STORAGE_KEY: "haalkhata-unfinished-sign-out" }));

import { finishUnfinishedSignOut, rememberUnfinishedSignOut } from "./unfinishedSignOut";
import { UNFINISHED_SIGN_OUT_STORAGE_KEY } from "./api.constants";

beforeEach(() => {
  vi.clearAllMocks();
  native.storage.clear();
});

describe("finishUnfinishedSignOut", () => {
  it("does nothing when no sign-out is waiting", async () => {
    await finishUnfinishedSignOut();
    expect(native.logOut).not.toHaveBeenCalled();
  });

  it("ends the remembered session with its own token, then forgets it", async () => {
    await rememberUnfinishedSignOut("token-a");
    native.logOut.mockResolvedValue({});
    await finishUnfinishedSignOut();
    expect(native.logOut).toHaveBeenCalledWith({}, { headers: { Authorization: "Bearer token-a" } });
    expect(native.storage.has(UNFINISHED_SIGN_OUT_STORAGE_KEY)).toBe(false);
  });

  it("forgets a session the server says has already ended", async () => {
    await rememberUnfinishedSignOut("token-a");
    native.logOut.mockRejectedValue(new ConnectError("session expired", Code.Unauthenticated));
    await finishUnfinishedSignOut();
    expect(native.storage.has(UNFINISHED_SIGN_OUT_STORAGE_KEY)).toBe(false);
  });

  it("keeps it for next time while the server still cannot be reached", async () => {
    await rememberUnfinishedSignOut("token-a");
    native.logOut.mockRejectedValue(new ConnectError("offline", Code.Unavailable));
    await finishUnfinishedSignOut();
    expect(native.storage.get(UNFINISHED_SIGN_OUT_STORAGE_KEY)).toBe("token-a");
  });
});
