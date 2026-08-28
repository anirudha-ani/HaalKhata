/** Tests for cross-account query-cache cleanup. */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { clearAccountQueryCache, QUERY_CACHE_STORAGE_KEY } from "./queryCache";

afterEach(() => vi.unstubAllGlobals());

describe("clearAccountQueryCache", () => {
  it("clears memory and removes the persisted account cache", () => {
    const clear = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { removeItem } });

    clearAccountQueryCache({ clear } as unknown as QueryClient);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith(QUERY_CACHE_STORAGE_KEY);
  });
});
