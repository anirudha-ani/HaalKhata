/** @vitest-environment jsdom */
/** A list that failed to load says so; it is never shown as nobody having any groups. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupStatus } from "@haalkhata/shared/group/status";
import { GroupsPage } from "./GroupsPage";
import { useGroups } from "./hooks/useGroups";

vi.mock("./hooks/useGroups", () => ({ useGroups: vi.fn() }));
vi.mock("@/lib/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/lib/api/connect", () => ({ errorMessage: (error: Error) => error.message }));
vi.mock("next/link", () => ({ default: () => null }));

const noGroups = { isLoading: false, groups: [], status: GroupStatus.ACTIVE, listError: null, retryList: vi.fn(), balance: "all", query: "" };
let root: Root;
let container: HTMLDivElement;

/**
 * Renders the page.
 *
 * @param state - What the hook returns.
 */
async function open(state: object) {
  vi.mocked(useGroups).mockReturnValue(state as never);
  await act(async () => {
    root.render(createElement(GroupsPage));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("GroupsPage", () => {
  it("says the list failed, not that there are no groups", async () => {
    await open({ ...noGroups, listError: new Error("try again") });

    expect(container.textContent).toContain("Groups could not be loaded: try again");
    expect(container.textContent).not.toContain("No groups yet");
  });

  it("says there are no groups when there really are none", async () => {
    await open(noGroups);

    expect(container.textContent).toContain("No groups yet");
  });
});
