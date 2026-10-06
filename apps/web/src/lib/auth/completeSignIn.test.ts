/** Regression tests for loading a fresh authenticated document after sign-in. */

import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_QUERY_CACHE_STORAGE_KEY } from "@/lib/api/queryCache";
import { completeBrowserSignIn } from "./completeSignIn";

afterEach(() => vi.unstubAllGlobals());

describe("completeBrowserSignIn", () => {
  it("loads a fresh dashboard document after clearing the previous account's data", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["me"], { id: "previous-account" });
    queryClient.setQueryData(["expenses"], [{ id: "previous-expense" }]);
    const removeItem = vi.fn();
    const replace = vi.fn(() => {
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
      expect(removeItem).toHaveBeenCalledWith(LEGACY_QUERY_CACHE_STORAGE_KEY);
    });
    vi.stubGlobal("window", {
      location: { search: "", replace },
      localStorage: { removeItem },
    });

    completeBrowserSignIn(queryClient);

    // A document replacement bypasses signed-out App Router payloads and
    // replaces the login entry rather than preserving the submitted form.
    expect(replace).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("preserves the requested in-app destination for the server's session guards", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "?next=%2Fjoin%2Finvite-token", replace },
      localStorage: { removeItem: vi.fn() },
    });

    completeBrowserSignIn(new QueryClient());

    expect(replace).toHaveBeenCalledExactlyOnceWith("/join/invite-token");
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "javascript:alert(1)",
  ])("rejects an unsafe redirect destination: %s", (requested) => {
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { search: `?next=${encodeURIComponent(requested)}`, replace },
      localStorage: { removeItem: vi.fn() },
    });

    completeBrowserSignIn(new QueryClient());

    expect(replace).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("still leaves the sign-in form when browser storage is blocked", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["me"], { id: "previous-account" });
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "", replace },
      get localStorage() {
        throw new DOMException("Storage is disabled", "SecurityError");
      },
    });

    completeBrowserSignIn(queryClient);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(replace).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });
});
