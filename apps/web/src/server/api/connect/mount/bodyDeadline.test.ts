/** Over real HTTP: a request body that stops arriving is cut off at its deadline, and one that arrives, or is never needed, is not. */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { enforceBodyDeadline } from "./bodyDeadline";

const DEADLINE_MS = 100;

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

/**
 * Starts a server that applies the deadline, then either reads the body and
 * answers, or answers at once without reading it (as a refusing gate does).
 *
 * @param readBody - Whether the handler reads the body before answering.
 * @param seen - Records whether the request was cut off.
 * @returns The server's port.
 */
async function start(readBody: boolean, seen: { destroyed: boolean }): Promise<number> {
  server = http.createServer(async (request, response) => {
    enforceBodyDeadline(request, response, DEADLINE_MS);
    request.on("close", () => {
      seen.destroyed = request.destroyed && !request.complete;
    });
    if (!readBody) {
      response.end("refused");
      return;
    }
    try {
      for await (const chunk of request) void chunk;
      response.end("read");
    } catch {
      // Cut off mid-body: the connection is already gone.
    }
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return (server!.address() as AddressInfo).port;
}

/**
 * Sends a request whose body is `sent` bytes of a declared `declared`.
 *
 * @param port - The server's port.
 * @param declared - The Content-Length announced.
 * @param sent - How many bytes are actually written before stalling.
 * @returns What happened: the response body, or "cut off".
 */
function send(port: number, declared: number, sent: number): Promise<string> {
  return new Promise((resolve) => {
    const request = http.request(
      { port, host: "127.0.0.1", method: "POST", agent: false, headers: { "content-length": declared } },
      (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => resolve(text));
      },
    );
    request.on("error", () => resolve("cut off"));
    request.write(Buffer.alloc(sent));
    if (sent === declared) request.end();
  });
}

describe("enforceBodyDeadline", () => {
  it("cuts off a body that stops arriving", async () => {
    const seen = { destroyed: false };
    const port = await start(true, seen);

    const started = Date.now();
    expect(await send(port, 1000, 10)).toBe("cut off");
    expect(Date.now() - started).toBeGreaterThanOrEqual(DEADLINE_MS - 10);
    expect(seen.destroyed).toBe(true);
  });

  it("leaves a body that arrives in time alone", async () => {
    const seen = { destroyed: false };
    const port = await start(true, seen);

    expect(await send(port, 1000, 1000)).toBe("read");
  });

  it("does not cut off a request answered without its body being read", async () => {
    const seen = { destroyed: false };
    const port = await start(false, seen);

    expect(await send(port, 1000, 1000)).toBe("refused");
    await new Promise((resolve) => setTimeout(resolve, DEADLINE_MS * 2));
    expect(seen.destroyed).toBe(false);
  });
});
