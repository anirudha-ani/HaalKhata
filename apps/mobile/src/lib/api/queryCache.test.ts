/** Regression tests for clearing account-scoped mobile query data. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ removeItem: vi.fn() }));
const QUERY_CACHE_STORAGE_KEY = "haalkhata-query-cache";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("./api.constants", () => ({ QUERY_CACHE_STORAGE_KEY: "haalkhata-query-cache" }));

import { clearMobileQueryCache, mobileQueryClient } from "./queryCache";

describe("clearMobileQueryCache", () => {
  beforeEach(() => {
    mobileQueryClient.clear();
    storage.removeItem.mockReset();
    storage.removeItem.mockResolvedValue(undefined);
  });

  it("removes both live and persisted data from the previous account", async () => {
    mobileQueryClient.setQueryData(["me"], { name: "previous account" });

    await clearMobileQueryCache();

    expect(mobileQueryClient.getQueryData(["me"])).toBeUndefined();
    expect(storage.removeItem).toHaveBeenCalledWith(QUERY_CACHE_STORAGE_KEY);
  });

  it("clears memory before reporting a storage failure", async () => {
    mobileQueryClient.setQueryData(["friends"], [{ name: "private" }]);
    storage.removeItem.mockRejectedValue(new Error("storage unavailable"));

    await expect(clearMobileQueryCache()).rejects.toThrow("storage unavailable");

    expect(mobileQueryClient.getQueryData(["friends"])).toBeUndefined();
  });
});
