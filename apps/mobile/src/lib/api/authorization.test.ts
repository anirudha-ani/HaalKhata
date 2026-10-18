/** Transport-level account isolation under delayed authentication responses. */
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { beforeEach, expect, it, vi } from "vitest";
import { SESSION_RENEWAL_HEADER, SESSION_TRANSPORT_HEADER } from "@haalkhata/shared/auth/sessionRenewal";

const storage = vi.hoisted(() => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
const cache = vi.hoisted(() => ({ clearMobileQueryCache: vi.fn() }));
vi.mock("expo-secure-store", () => storage);
vi.mock("./api.constants", () => ({ TOKEN_STORAGE_KEY: "test-session" }));
vi.mock("./queryCache", () => cache);

type Next = Parameters<Interceptor>[0];
type Request = Parameters<Next>[0];
type Response = Awaited<ReturnType<Next>>;

/** @returns The headers used by the interceptor, without an unrelated RPC payload. */
function request(): Request { return { header: new Headers() } as Request; }
/** @param renewed - Optional refreshed credential. @returns The transport response headers. */
function response(renewed?: string): Response {
  return { header: new Headers(renewed ? { [SESSION_RENEWAL_HEADER]: renewed } : {}) } as Response;
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  storage.setItemAsync.mockResolvedValue(undefined);
  storage.deleteItemAsync.mockResolvedValue(undefined);
  cache.clearMobileQueryCache.mockResolvedValue(undefined);
});

it("keeps the new account when an old request is rejected", async () => {
  const session = await import("./session");
  const { authorization } = await import("./authorization");
  await session.setSessionToken("old-account");
  const pending = Promise.withResolvers<Response>();
  const sent = authorization(() => pending.promise)(request());
  await session.setSessionToken("new-account");
  const failure = new ConnectError("expired", Code.Unauthenticated);
  pending.reject(failure);
  await expect(sent).rejects.toBe(failure);
  expect(session.sessionToken()).toBe("new-account");
  expect(cache.clearMobileQueryCache).not.toHaveBeenCalled();
});

it("ignores a late renewal after logout and login, even if the token repeats", async () => {
  const session = await import("./session");
  const { authorization } = await import("./authorization");
  await session.setSessionToken("same-token");
  const pending = Promise.withResolvers<Response>();
  const sent = authorization(() => pending.promise)(request());
  await session.clearSession();
  await session.setSessionToken("same-token");
  pending.resolve(response("old-renewal"));
  await sent;
  expect(session.sessionToken()).toBe("same-token");
});

it("clears the expired account and cache before waiting for keychain deletion", async () => {
  const session = await import("./session");
  const { authorization } = await import("./authorization");
  await session.setSessionToken("expired-account");
  const deletion = Promise.withResolvers<void>();
  storage.deleteItemAsync.mockReturnValue(deletion.promise);
  const failure = new ConnectError("expired", Code.Unauthenticated);
  const sent = authorization(async () => { throw failure; })(request());
  await Promise.resolve();
  expect(session.sessionToken()).toBeNull();
  expect(cache.clearMobileQueryCache).toHaveBeenCalledOnce();
  deletion.resolve();
  await expect(sent).rejects.toBe(failure);
});

it("attaches bearer headers and persists a current-session renewal", async () => {
  const session = await import("./session");
  const { authorization } = await import("./authorization");
  await session.setSessionToken("current");
  const outgoing = request();
  await authorization(async () => response("renewed"))(outgoing);
  expect(outgoing.header.get("Authorization")).toBe("Bearer current");
  expect(outgoing.header.get(SESSION_TRANSPORT_HEADER)).toBe("bearer");
  expect(session.sessionToken()).toBe("renewed");
});

it("preserves a valid session on permission denial or connectivity failure", async () => {
  const session = await import("./session");
  const { authorization } = await import("./authorization");
  await session.setSessionToken("current");
  for (const code of [Code.PermissionDenied, Code.Unavailable]) {
    const failure = new ConnectError("request failed", code);
    await expect(authorization(async () => { throw failure; })(request())).rejects.toBe(failure);
  }
  expect(session.sessionToken()).toBe("current");
  expect(cache.clearMobileQueryCache).not.toHaveBeenCalled();
});

it("leaves a call that brings its own token alone, even when the server rejects it", async () => {
  const session = await import("./session");
  const { authorization } = await import("./authorization");
  await session.setSessionToken("current-account");
  const ownCredentials = request();
  ownCredentials.header.set("Authorization", "Bearer signed-out-account");
  const failure = new ConnectError("expired", Code.Unauthenticated);
  const sent = authorization(async (forwarded) => {
    expect(forwarded.header.get("Authorization")).toBe("Bearer signed-out-account");
    throw failure;
  })(ownCredentials);
  await expect(sent).rejects.toBe(failure);
  expect(session.sessionToken()).toBe("current-account");
  expect(cache.clearMobileQueryCache).not.toHaveBeenCalled();
});
