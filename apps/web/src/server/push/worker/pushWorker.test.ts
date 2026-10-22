/** The push worker listens from the start, waits for migrations it never runs, and then drains. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isMigrated: vi.fn(),
  ensureMigrated: vi.fn(),
  listen: vi.fn(),
  close: vi.fn(),
  drainPushOutbox: vi.fn(),
  checkPushReceipts: vi.fn(),
}));

vi.mock("@/server/common/db/db", () => ({ isMigrated: mocks.isMigrated, ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/server/common/db/listen", () => ({ listen: mocks.listen }));
vi.mock("@/server/common/logger", () => ({ logEvent: vi.fn(), logError: vi.fn() }));
vi.mock("@/server/push/usecase/dispatch/dispatch.usecase", () => ({ drainPushOutbox: mocks.drainPushOutbox }));
vi.mock("@/server/push/usecase/receipts/receipts.usecase", () => ({ checkPushReceipts: mocks.checkPushReceipts }));

import { startPushWorker } from "./pushWorker";

const cache = globalThis as unknown as { __haalkhataPushWorker?: { stop(): Promise<void> } };

/** @returns The wake-up callback the worker handed to LISTEN. */
function wakeUp(): () => void {
  return mocks.listen.mock.calls[0][1];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listen.mockReturnValue({ close: mocks.close });
  mocks.drainPushOutbox.mockResolvedValue({ claimed: 0, sent: 0, skipped: 0, retried: 0, dropped: 0 });
});

afterEach(async () => {
  await cache.__haalkhataPushWorker?.stop();
  delete cache.__haalkhataPushWorker;
});

describe("startPushWorker", () => {
  it("subscribes at once, even before the schema is ready", () => {
    mocks.isMigrated.mockReturnValue(false);
    startPushWorker();
    expect(mocks.listen).toHaveBeenCalledWith("push_outbox", expect.any(Function));
  });

  it("never runs migrations itself and skips passes until the app has", async () => {
    mocks.isMigrated.mockReturnValue(false);
    startPushWorker();
    wakeUp()();
    await Promise.resolve();
    expect(mocks.drainPushOutbox).not.toHaveBeenCalled();
    expect(mocks.ensureMigrated).not.toHaveBeenCalled();
  });

  it("drains on a wake-up once migrations are in", async () => {
    mocks.isMigrated.mockReturnValue(true);
    startPushWorker();
    wakeUp()();
    await vi.waitFor(() => expect(mocks.drainPushOutbox).toHaveBeenCalledOnce());
  });

  it("closes the subscription when it stops", async () => {
    mocks.isMigrated.mockReturnValue(true);
    startPushWorker();
    await cache.__haalkhataPushWorker?.stop();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
