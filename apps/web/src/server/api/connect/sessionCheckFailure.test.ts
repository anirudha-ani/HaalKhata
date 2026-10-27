/**
 * Over real HTTP, through the Connect router the app mounts: when checking
 * the session fails unexpectedly (the database is unreachable), every RPC
 * answers with the same generic error carrying a reference, never the
 * cause, and the cause is logged under that reference with the RPC's name.
 * Audit A19: three RPCs checked the session before runUsecase, so their
 * failure reached nobody's log.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { Code, ConnectError, createClient, type Interceptor } from "@connectrpc/connect";
import { connectNodeAdapter, createConnectTransport } from "@connectrpc/connect-node";
import { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
});

const DATABASE_FAILURE = "connect ECONNREFUSED internal-db:5432";

vi.mock("@/server/auth/repo/users.repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/repo/users.repo")>()),
  findUserTokenVersion: vi.fn(async () => {
    throw new Error(DATABASE_FAILURE);
  }),
}));

vi.mock("@/server/common/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/common/logger")>()),
  logError: vi.fn(),
}));

import routes from "./routes";
import { createToken } from "@/server/auth/usecase/session/session";
import { logError } from "@/server/common/logger";

const PUBLIC_FAILURE = /^internal server error \(request ([0-9a-f-]{36})\)$/;

describe("an RPC whose session check fails unexpectedly", () => {
  let server: http.Server;
  let auth: ReturnType<typeof createClient<typeof AuthService>>;
  let receipts: ReturnType<typeof createClient<typeof ReceiptService>>;

  beforeAll(async () => {
    server = http.createServer(connectNodeAdapter({ routes }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const token = createToken("user-signed-in", 0);
    /** Sends the session the way the mobile app does. */
    const bearer: Interceptor = (next) => (request) => {
      request.header.set("authorization", `Bearer ${token}`);
      return next(request);
    };
    const transport = createConnectTransport({
      baseUrl: `http://127.0.0.1:${port}`,
      httpVersion: "1.1",
      interceptors: [bearer],
    });
    auth = createClient(AuthService, transport);
    receipts = createClient(ReceiptService, transport);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    vi.mocked(logError).mockClear();
  });

  const calls: { rpc: string; send: () => Promise<unknown> }[] = [
    { rpc: "SetPhone", send: () => auth.setPhone({ phone: "+14155550123", verificationCode: "" }) },
    { rpc: "RemovePhone", send: () => auth.removePhone({}) },
    {
      rpc: "ParseReceipt",
      send: () => receipts.parseReceipt({ image: new Uint8Array([1]), consentVersion: "1", currency: "USD" }),
    },
    // Already inside runUsecase: the behaviour the other three now match.
    { rpc: "GetMe", send: () => auth.getMe({}) },
  ];

  it.each(calls)("$rpc answers generically with a reference and logs the cause under it", async ({ rpc, send }) => {
    const failure = await send().then(
      () => undefined,
      (error: unknown) => ConnectError.from(error),
    );

    expect(failure?.code).toBe(Code.Internal);
    const reference = failure?.rawMessage.match(PUBLIC_FAILURE)?.[1];
    expect(reference, `public message was "${failure?.rawMessage}"`).toBeDefined();
    expect(failure?.rawMessage).not.toContain("internal-db");
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: DATABASE_FAILURE }), {
      rpc,
      requestId: reference,
    });
  });
});
