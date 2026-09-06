/** Behavioral tests for notification navigation in the shipped service worker. */

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** Minimal event shape shared by push and notification-click tests. */
interface WorkerEvent {
  waitUntil: (promise: Promise<unknown>) => void;
  data?: { json: () => Record<string, unknown> };
  notification?: { close: () => void; data?: { link?: unknown } };
}

/** Service-worker listener registered by the public script. */
type WorkerListener = (event: WorkerEvent) => void;

/**
 * Executes the real public worker script against a minimal worker scope.
 *
 * @returns Registered listeners and spies for notification/openWindow calls.
 */
function workerHarness(): {
  listeners: Map<string, WorkerListener>;
  openWindow: ReturnType<typeof vi.fn>;
  showNotification: ReturnType<typeof vi.fn>;
} {
  const listeners = new Map<string, WorkerListener>();
  const openWindow = vi.fn(() => Promise.resolve());
  const showNotification = vi.fn(() => Promise.resolve());
  const workerScope = {
    location: { origin: "https://app.example" },
    addEventListener: (type: string, listener: WorkerListener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), openWindow },
    registration: { showNotification },
  };
  const workerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  runInNewContext(workerSource, {
    URL,
    Promise,
    caches: {},
    fetch: vi.fn(),
    self: workerScope,
  });
  return { listeners, openWindow, showNotification };
}

/**
 * Invokes a worker listener and waits for the promise passed to waitUntil.
 *
 * @param listener - Registered push or notification-click listener.
 * @param event - Event-specific fields supplied to that listener.
 * @returns A promise that settles with the listener's waitUntil work.
 */
async function dispatch(
  listener: WorkerListener,
  event: Omit<WorkerEvent, "waitUntil">,
): Promise<void> {
  let pending: Promise<unknown> = Promise.resolve();
  listener({
    ...event,
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  await pending;
}

describe("service-worker notification navigation", () => {
  it("stores an allowlisted same-origin path from a push payload", async () => {
    const { listeners, showNotification } = workerHarness();

    await dispatch(listeners.get("push")!, {
      data: { json: () => ({ title: "Expense", link: "/expenses/expense-123" }) },
    });

    expect(showNotification).toHaveBeenCalledWith(
      "Expense",
      expect.objectContaining({ data: { link: "/expenses/expense-123" } }),
    );
  });

  it.each([
    "https://attacker.example/phish",
    "//attacker.example/phish",
    "javascript:alert(1)",
    "/\\attacker.example/phish",
  ])("replaces an unsafe push link %s", async (link) => {
    const { listeners, showNotification } = workerHarness();

    await dispatch(listeners.get("push")!, {
      data: { json: () => ({ link }) },
    });

    expect(showNotification).toHaveBeenCalledWith(
      "HaalKhata",
      expect.objectContaining({ data: { link: "/dashboard" } }),
    );
  });

  it("revalidates stored notification data before opening a window", async () => {
    const { listeners, openWindow } = workerHarness();
    const close = vi.fn();

    await dispatch(listeners.get("notificationclick")!, {
      notification: { close, data: { link: "https://attacker.example/phish" } },
    });

    expect(close).toHaveBeenCalledOnce();
    expect(openWindow).toHaveBeenCalledWith("/dashboard");
  });
});
