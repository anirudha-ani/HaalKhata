/** @vitest-environment jsdom */
/** Regression tests for avatar identity across list and profile changes. */

import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "./Avatar";

type AvatarUser = ComponentProps<typeof Avatar>["user"];

const ALICE: AvatarUser = {
  id: "alice",
  name: "Alice Adams",
  avatarColor: "#123456",
  avatarUrl: "https://example.com/alice.png",
};
const BOBBY: AvatarUser = {
  id: "bobby",
  name: "Bob Brown",
  avatarColor: "#654321",
  avatarUrl: "https://example.com/bob.png",
};
let container: HTMLDivElement;
let root: Root;

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

/**
 * Updates one mounted avatar, as when a profile or selected person changes.
 *
 * @param user - Person to show in the existing component position.
 */
function renderAvatar(user: AvatarUser) {
  act(() => root.render(createElement(Avatar, { user })));
}

/**
 * Reads the currently displayed image, failing if the avatar is initials.
 *
 * @returns The rendered image node.
 */
function picture(): HTMLImageElement {
  const image = container.querySelector("img");
  expect(image).not.toBeNull();
  return image!;
}

describe("Avatar", () => {
  it("keeps pictures and initials beside their people when rows reorder", () => {
    const people = [ALICE, { ...BOBBY, avatarUrl: "" }];
    /**
     * Renders the same user-keyed rows as the People list.
     *
     * @param users - People in the requested display order.
     */
    const renderPeople = (users: AvatarUser[]) => {
      act(() => root.render(createElement("div", null,
        users.map((user) => createElement(Avatar, { key: user.id, user })),
      )));
    };
    renderPeople(people);
    const alicePicture = picture();

    renderPeople([...people].reverse());

    const avatars = container.querySelectorAll("span");
    expect(avatars[0].title).toBe(BOBBY.name);
    expect(avatars[0].textContent).toBe("BB");
    expect(avatars[0].style.backgroundColor).toBe("rgb(101, 67, 33)");
    expect(avatars[1].title).toBe(ALICE.name);
    expect(avatars[1].querySelector("img")).toBe(alicePicture);
    expect(alicePicture.getAttribute("src")).toBe(ALICE.avatarUrl);
  });

  it("replaces the image node when the person changes", () => {
    renderAvatar(ALICE);
    const previousPicture = picture();

    renderAvatar(BOBBY);

    expect(picture()).not.toBe(previousPicture);
    expect(picture().getAttribute("src")).toBe(BOBBY.avatarUrl);
    expect(container.querySelector("span")?.title).toBe(BOBBY.name);
  });

  it("replaces the image node when the same person's photo changes", () => {
    renderAvatar(ALICE);
    const previousPicture = picture();

    renderAvatar({ ...ALICE, avatarUrl: "https://example.com/alice-new.png" });

    expect(picture()).not.toBe(previousPicture);
  });

  it("retries a new photo after the previous photo failed", () => {
    renderAvatar(ALICE);
    act(() => picture().dispatchEvent(new Event("error")));
    expect(container.textContent).toBe("AA");
    renderAvatar({ ...ALICE });
    expect(container.querySelector("img")).toBeNull();

    renderAvatar({ ...ALICE, avatarUrl: "https://example.com/alice-new.png" });

    expect(picture().getAttribute("src")).toBe("https://example.com/alice-new.png");
  });

  it("does not transfer a failed picture to another person, even with the same URL", () => {
    renderAvatar(ALICE);
    act(() => picture().dispatchEvent(new Event("error")));

    renderAvatar({ ...BOBBY, avatarUrl: ALICE.avatarUrl });

    expect(picture().getAttribute("src")).toBe(ALICE.avatarUrl);
    act(() => picture().dispatchEvent(new Event("error")));
    expect(container.textContent).toBe("BB");
  });

  it("ignores a delayed error from the previous person's image", () => {
    renderAvatar(ALICE);
    const previousPicture = picture();
    renderAvatar(BOBBY);

    act(() => previousPicture.dispatchEvent(new Event("error")));

    expect(picture().getAttribute("src")).toBe(BOBBY.avatarUrl);
  });
});
