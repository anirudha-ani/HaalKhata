/**
 * Over real HTTP, through the app's Connect routes and mount options: a tiny
 * compressed request cannot make the server decode megabytes of fields it
 * never uses, a request without a session is refused before its body is
 * read, and the anonymous sign-in calls are paced before theirs is.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { brotliCompressSync } from "node:zlib";
import { fromBinary } from "@bufbuild/protobuf";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { ParseReceiptRequestSchema } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
});

import routes from "../routes";
import { CONNECT_MOUNT_OPTIONS } from "./mountOptions";
import { AUTH_RATE_LIMIT } from "@/server/auth/auth.constants";
import { DIRECT_CLIENT_IP_HEADER } from "@/server/auth/request/clientIp";

const MEBIBYTE = 1024 * 1024;

/**
 * Bytes that are all protobuf fields no message defines: field 15 as a
 * varint of zero, two bytes each, repeated. A decoder that keeps unknown
 * fields turns every pair into an object.
 *
 * @param size - How many bytes to make.
 * @returns The bytes.
 */
function unknownFields(size: number): Buffer {
  const bytes = Buffer.alloc(size - (size % 2));
  for (let index = 0; index < bytes.length; index += 2) bytes[index] = 0x78;
  return bytes;
}

let baseUrl: string;
let server: http.Server;

/**
 * Posts a body to one RPC the way a Connect client does, from its own address.
 *
 * @param procedure - "package.Service/Method".
 * @param body - The request body.
 * @param address - The caller's address, so each test has its own rate-limit bucket.
 * @param headers - Extra headers, e.g. Content-Encoding.
 * @returns The HTTP status and the Connect error code, if any.
 */
async function post(procedure: string, body: Buffer, address: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/${procedure}`, {
    method: "POST",
    headers: {
      "content-type": "application/proto",
      "connect-protocol-version": "1",
      [DIRECT_CLIENT_IP_HEADER]: address,
      ...headers,
    },
    body: new Uint8Array(body),
  });
  const text = await response.text();
  let code = "";
  try {
    code = (JSON.parse(text) as { code?: string }).code ?? "";
  } catch {
    code = "";
  }
  return { status: response.status, code };
}

beforeAll(async () => {
  server = http.createServer(connectNodeAdapter({ routes, ...CONNECT_MOUNT_OPTIONS }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("what a request can cost before anyone is known", () => {
  it("refuses 12 MiB of fields compressed into a few bytes at sign-in, without decoding them", async () => {
    const bomb = brotliCompressSync(unknownFields(12 * MEBIBYTE - 1024));
    expect(bomb.length).toBeLessThan(1024);

    const result = await post("auth.v1.AuthService/LogIn", bomb, "198.51.100.1", { "content-encoding": "br" });

    expect(result.code).toBe("resource_exhausted");
  });

  it("drops fields no message defines while decoding, so a receipt-sized body of them costs almost nothing", () => {
    const bytes = unknownFields(12 * MEBIBYTE - 1024);
    const before = process.memoryUsage().heapUsed;

    const decoded = fromBinary(ParseReceiptRequestSchema, bytes, CONNECT_MOUNT_OPTIONS.binaryOptions);

    const grewBy = process.memoryUsage().heapUsed - before;
    expect(decoded.$unknown ?? []).toHaveLength(0);
    expect(grewBy).toBeLessThan(64 * MEBIBYTE);
  });

  it("refuses a request without a session before reading its body", async () => {
    // Not protobuf at all: reading it would fail to parse; refusing it first says who is asking.
    const junk = Buffer.alloc(1024, 0xff);

    const result = await post("expense.v1.ExpenseService/ListExpenses", junk, "198.51.100.2");

    expect(result.code).toBe("unauthenticated");
  });

  it("paces sign-in per address before reading the body", async () => {
    const junk = Buffer.alloc(1024, 0xff);
    const codes: string[] = [];
    for (let attempt = 0; attempt <= AUTH_RATE_LIMIT; attempt += 1) {
      codes.push((await post("auth.v1.AuthService/LogIn", junk, "198.51.100.3")).code);
    }

    expect(codes.slice(0, AUTH_RATE_LIMIT)).not.toContain("resource_exhausted");
    expect(codes[AUTH_RATE_LIMIT]).toBe("resource_exhausted");
  });

  it("still serves the sign-in calls that need no session", async () => {
    const result = await post("auth.v1.AuthService/GetSignInOptions", Buffer.alloc(0), "198.51.100.4");

    expect(result.status).toBe(200);
  });
});
