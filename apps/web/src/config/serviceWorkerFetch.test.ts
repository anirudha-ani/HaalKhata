/** Behavioral tests for what the shipped service worker will and will not cache. */

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** The subset of a fetch event the handler reads. */
interface FetchEvent {
  request: { method: string; url: string; mode: string; headers: Headers };
  respondWith: (promise: Promise<unknown>) => void;
}

/**
 * Executes the real public worker script with a recording cache.
 *
 * @param workerOrigin - Origin the worker controls.
 * @returns The fetch listener plus spies on the network and the cache.
 */
function fetchHarness(workerOrigin = "https://app.example"): {
  onFetch: (event: FetchEvent) => void;
  fetchMock: ReturnType<typeof vi.fn>;
  cachePut: ReturnType<typeof vi.fn>;
} {
  const listeners = new Map<string, (event: FetchEvent) => void>();
  const cachePut = vi.fn();
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, clone: () => ({ cloned: true }) }),
  );
  const workerScope = {
    location: { origin: workerOrigin },
    addEventListener: (type: string, listener: (event: FetchEvent) => void) =>
      listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), openWindow: vi.fn() },
    registration: { showNotification: vi.fn() },
  };
  const workerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  runInNewContext(workerSource, {
    URL,
    Promise,
    caches: {
      match: () => Promise.resolve(undefined),
      open: () => Promise.resolve({ put: cachePut, addAll: vi.fn() }),
      keys: () => Promise.resolve([]),
      delete: vi.fn(),
    },
    fetch: fetchMock,
    self: workerScope,
  });
  return { onFetch: listeners.get("fetch")!, fetchMock, cachePut };
}

/**
 * Builds a fetch event for one request.
 *
 * @param requestUrl - Absolute URL requested.
 * @param overrides - Method, mode or headers to vary.
 * @returns The event and a spy on respondWith.
 */
function fetchEvent(
  requestUrl: string,
  overrides: Partial<{ method: string; mode: string; headers: Record<string, string> }> = {},
): { event: FetchEvent; respondWith: ReturnType<typeof vi.fn> } {
  const respondWith = vi.fn();
  return {
    event: {
      request: {
        method: overrides.method ?? "GET",
        url: requestUrl,
        mode: overrides.mode ?? "no-cors",
        headers: new Headers(overrides.headers ?? {}),
      },
      respondWith,
    },
    respondWith,
  };
}

describe("service-worker fetch handling", () => {
  it("serves and stores content-hashed build assets", async () => {
    const { onFetch, cachePut } = fetchHarness();
    const { event, respondWith } = fetchEvent("https://app.example/_next/static/chunks/app-1a2b3c.js");
    onFetch(event);
    expect(respondWith).toHaveBeenCalledOnce();
    await respondWith.mock.calls[0][0];
    expect(cachePut).toHaveBeenCalledOnce();
  });

  it("leaves development assets to the network because their names are stable", () => {
    const { onFetch, cachePut, fetchMock } = fetchHarness("http://localhost:3000");
    const { event, respondWith } = fetchEvent(
      "http://localhost:3000/_next/static/css/app/layout.css",
    );
    onFetch(event);
    expect(respondWith).not.toHaveBeenCalled();
    expect(cachePut).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a navigation", "https://app.example/dashboard", { mode: "navigate" }],
    ["an RSC payload by query", "https://app.example/dashboard?_rsc=1a2b", {}],
    ["an RSC payload by header", "https://app.example/friends/abc", { headers: { RSC: "1" } }],
    ["an API call", "https://app.example/api/connect/expense.v1.ExpenseService/ListExpenses", {}],
    ["a non-GET", "https://app.example/_next/static/chunks/x.js", { method: "POST" }],
    ["a cross-origin asset", "https://cdn.example/_next/static/chunks/x.js", {}],
    ["any other same-origin route", "https://app.example/expenses/new", {}],
  ])("leaves %s to the network and never caches it", (_label, requestUrl, overrides) => {
    // L-02: everything account-dependent must stay out of the cache, across
    // sign-outs included — so it is simply never intercepted.
    const { onFetch, cachePut, fetchMock } = fetchHarness();
    const { event, respondWith } = fetchEvent(requestUrl, overrides);
    onFetch(event);
    expect(respondWith).not.toHaveBeenCalled();
    expect(cachePut).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
