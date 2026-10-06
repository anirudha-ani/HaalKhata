/** Tests for cross-account query-cache cleanup. */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
  clearAccountQueryCache,
  clearLegacyPersistedQueryCache,
  LEGACY_QUERY_CACHE_STORAGE_KEY,
} from "./queryCache";

afterEach(() => vi.unstubAllGlobals());

describe("clearAccountQueryCache", () => {
  it("clears memory and removes the persisted account cache", () => {
    const clear = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { removeItem } });

    clearAccountQueryCache({ clear } as unknown as QueryClient);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith(LEGACY_QUERY_CACHE_STORAGE_KEY);
  });

  it("removes historical plaintext cache data during provider startup", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { removeItem } });

    clearLegacyPersistedQueryCache();

    expect(removeItem).toHaveBeenCalledWith(LEGACY_QUERY_CACHE_STORAGE_KEY);
  });

  it("still clears account data when the browser denies access to localStorage", () => {
    const clear = vi.fn();
    vi.stubGlobal("window", {
      get localStorage() {
        throw new DOMException("Storage is disabled", "SecurityError");
      },
    });

    expect(() => clearAccountQueryCache({ clear } as unknown as QueryClient)).not.toThrow();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("allows provider startup when removing the legacy cache fails", () => {
    vi.stubGlobal("window", {
      localStorage: {
        removeItem: () => {
          throw new DOMException("Storage is disabled", "SecurityError");
        },
      },
    });

    expect(() => clearLegacyPersistedQueryCache()).not.toThrow();
  });
});
