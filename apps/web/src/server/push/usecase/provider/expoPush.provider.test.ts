/** Tests for the Expo HTTP client: authentication, envelopes and which failures are worth retrying. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_SEND_URL } from "@/server/push/push.constants";
import { expoPushProvider } from "./expoPush.provider";
import type { PushMessage } from "./pushTypes";

const MESSAGE: PushMessage = {
  to: "ExponentPushToken[abcdefghijklmnopqrstuv]",
  title: "Ani added \"Dinner\"",
  body: "Goa trip",
  data: { notificationId: "note-1", link: "/expenses/exp-1", recipientId: "user-b" },
  sound: "default",
  badge: 1,
  threadId: "group-grp-1",
  collapseId: "note-1",
  categoryId: "expenses",
  ttl: 86_400,
  priority: "high",
};

const fetchMock = vi.fn();

/**
 * A JSON response.
 *
 * @param status - HTTP status.
 * @param payload - Body.
 * @returns The response.
 */
function answer(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("EXPO_ACCESS_TOKEN_FILE", "");
  vi.stubEnv("EXPO_ACCESS_TOKEN", "secret-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("expoPushProvider", () => {
  it("posts the messages with the access token and returns the tickets", async () => {
    fetchMock.mockResolvedValue(answer(200, { data: [{ status: "ok", id: "ticket-1" }] }));
    const tickets = await expoPushProvider().send([MESSAGE]);
    expect(tickets).toEqual([{ status: "ok", id: "ticket-1" }]);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe(EXPO_PUSH_SEND_URL);
    expect(init.headers.authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body)).toEqual([MESSAGE]);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends without authorization when no token is configured", async () => {
    vi.stubEnv("EXPO_ACCESS_TOKEN", "");
    fetchMock.mockResolvedValue(answer(200, { data: [{ status: "ok", id: "ticket-1" }] }));
    await expoPushProvider().send([MESSAGE]);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it.each([
    [429, { errors: [{ code: "TOO_MANY_REQUESTS", message: "slow" }] }, true],
    [503, { errors: [{ code: "INTERNAL", message: "down" }] }, true],
    [401, { errors: [{ code: "UNAUTHORIZED", message: "no" }] }, true],
    [400, { errors: [{ code: "PUSH_TOO_MANY_NOTIFICATIONS", message: "too many" }] }, false],
  ])("marks HTTP %s as retryable=%s", async (status, payload, retryable) => {
    fetchMock.mockResolvedValue(answer(status, payload));
    await expect(expoPushProvider().send([MESSAGE])).rejects.toMatchObject({ name: "PushTransportError", retryable });
  });

  it("treats a network failure as retryable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(expoPushProvider().send([MESSAGE])).rejects.toMatchObject({ retryable: true });
  });

  it("refuses a ticket list that does not line up with the request", async () => {
    fetchMock.mockResolvedValue(answer(200, { data: [] }));
    await expect(expoPushProvider().send([MESSAGE])).rejects.toMatchObject({ retryable: true });
  });

  it("reads receipts by id", async () => {
    fetchMock.mockResolvedValue(answer(200, { data: { "ticket-1": { status: "ok" } } }));
    expect(await expoPushProvider().receipts(["ticket-1"])).toEqual({ "ticket-1": { status: "ok" } });
    expect(fetchMock.mock.calls[0][0]).toBe(EXPO_PUSH_RECEIPTS_URL);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ids: ["ticket-1"] });
  });

  it("makes no request for nothing", async () => {
    expect(await expoPushProvider().send([])).toEqual([]);
    expect(await expoPushProvider().receipts([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
