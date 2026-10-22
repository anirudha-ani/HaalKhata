/** @vitest-environment jsdom */
/** Completion must escape cached onboarding redirects and preserve visible failures. */

import { create } from "@bufbuild/protobuf";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/api/connect";
import { useOnboarding } from "./useOnboarding";

vi.mock("@/lib/api/connect", () => ({
  authClient: {
    getMe: vi.fn(),
    completeOnboarding: vi.fn(),
    updateProfile: vi.fn(),
    setContactDiscovery: vi.fn(),
  },
  errorMessage: (error: Error) => error.message,
}));

const INITIAL_USER = create(UserSchema, {
  id: "new-user",
  name: "New Person",
  defaultCurrency: "USD",
});
const COMPLETED_USER = create(UserSchema, { ...INITIAL_USER, onboarded: true });
const replaceDocument = vi.fn();
let queryClient: QueryClient;
let container: HTMLDivElement;
let root: Root;
let onboarding: ReturnType<typeof useOnboarding>;

/**
 * Exposes the real hook and its visible completion error to the tests.
 *
 * @returns The message the payment step would display on failure.
 */
function OnboardingHarness() {
  const current = useOnboarding();
  useEffect(() => {
    onboarding = current;
  }, [current]);
  return createElement("p", null, current.error);
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", new Proxy(window, {
    get: (target, property) => property === "location"
      ? { replace: replaceDocument }
      : Reflect.get(target, property, target),
  }));
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.me, INITIAL_USER);
  vi.mocked(authClient.getMe).mockResolvedValue(INITIAL_USER);
  vi.mocked(authClient.completeOnboarding).mockResolvedValue(COMPLETED_USER);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider,
    { client: queryClient }, createElement(OnboardingHarness),
  )));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("onboarding completion", () => {
  it("replaces the document after saving, bypassing any cached app redirect", async () => {
    replaceDocument.mockImplementation(() => {
      expect(queryClient.getQueryData(queryKeys.me)).toEqual(COMPLETED_USER);
    });
    act(() => onboarding.skip());
    expect(onboarding.step).toBe("payment");

    await act(async () => onboarding.complete());

    expect(authClient.completeOnboarding).toHaveBeenCalledExactlyOnceWith({});
    expect(replaceDocument).toHaveBeenCalledExactlyOnceWith("/dashboard");
    // The mutation returns the saved profile; another request must not hold
    // the person on the completion screen or restore stale onboarding data.
    expect(authClient.getMe).not.toHaveBeenCalled();
  });

  it("waits for the completion write before leaving the form", async () => {
    let completeRequest!: (user: typeof COMPLETED_USER) => void;
    vi.mocked(authClient.completeOnboarding).mockReturnValue(new Promise((resolve) => {
      completeRequest = resolve;
    }));
    await act(async () => onboarding.complete());
    expect(replaceDocument).not.toHaveBeenCalled();

    await act(async () => completeRequest(COMPLETED_USER));

    expect(replaceDocument).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("shows a failed completion beside the finish control and stays on the payment step", async () => {
    vi.mocked(authClient.completeOnboarding).mockRejectedValue(new Error("Could not save; try again"));
    act(() => onboarding.skip());

    await act(async () => {
      onboarding.complete();
      // React Query batches mutation notifications onto the next task.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toBe("Could not save; try again");
    expect(onboarding.step).toBe("payment");
    expect(replaceDocument).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.me)).toEqual(INITIAL_USER);
  });
});

describe("onboarding discoverability switch", () => {
  it("starts on, the default, and records the yes with the profile", async () => {
    vi.mocked(authClient.updateProfile).mockResolvedValue(INITIAL_USER);
    vi.mocked(authClient.setContactDiscovery).mockResolvedValue(INITIAL_USER);
    expect(onboarding.findable).toBe(true);

    await act(async () => {
      onboarding.save();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(authClient.updateProfile).toHaveBeenCalledOnce();
    expect(authClient.setContactDiscovery).toHaveBeenCalledExactlyOnceWith({ discoverable: true });
    expect(onboarding.step).toBe("payment");
  });

  it("saves a no when the person turns it off", async () => {
    vi.mocked(authClient.updateProfile).mockResolvedValue(INITIAL_USER);
    vi.mocked(authClient.setContactDiscovery).mockResolvedValue(INITIAL_USER);
    act(() => onboarding.setFindable(false));

    await act(async () => {
      onboarding.save();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(authClient.setContactDiscovery).toHaveBeenCalledExactlyOnceWith({ discoverable: false });
    expect(onboarding.step).toBe("payment");
  });

  it("shows a failed save beside Continue and stays on the profile step", async () => {
    vi.mocked(authClient.updateProfile).mockResolvedValue(INITIAL_USER);
    vi.mocked(authClient.setContactDiscovery).mockRejectedValue(new Error("Couldn't save — try again"));

    await act(async () => {
      onboarding.save();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toBe("Couldn't save — try again");
    expect(onboarding.step).toBe("profile");
  });
});
