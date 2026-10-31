/** @vitest-environment jsdom */
/** A write made offline runs at once, so it can fail where it can be seen, and never waits to fire later. */

import { onlineManager, useMutation, useQuery } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "./Providers";

const write = vi.fn(async () => {
  throw new Error("no connection");
});
const read = vi.fn(async () => "saved");
let send: () => void;
let writeFailed: boolean;
let readStatus: string;
let root: Root;
let container: HTMLDivElement;

/** A page making one read and one write. */
function Page() {
  const mutation = useMutation({ mutationFn: write, retry: false });
  const query = useQuery({ queryKey: ["reading"], queryFn: read, retry: false });
  useEffect(() => {
    send = () => mutation.mutate();
    writeFailed = mutation.isError;
    readStatus = query.fetchStatus;
  });
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  write.mockClear();
  read.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onlineManager.setOnline(false);
  await act(async () => root.render(createElement(Providers, null, createElement(Page))));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("Providers offline", () => {
  it("runs a write straight away, so its failure can be shown", async () => {
    await act(async () => send());
    await vi.waitFor(() => expect(writeFailed).toBe(true));

    expect(write).toHaveBeenCalledOnce();
  });

  it("leaves nothing waiting to fire when the connection comes back", async () => {
    await act(async () => send());
    write.mockClear();

    await act(async () => onlineManager.setOnline(true));

    expect(write).not.toHaveBeenCalled();
  });

  it("still holds a read until there is a connection", () => {
    expect(read).not.toHaveBeenCalled();
    expect(readStatus).toBe("paused");
  });
});
