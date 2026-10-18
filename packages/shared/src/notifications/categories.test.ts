/** Tests for the notification-kind to push-switch map. */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUSH_PREFERENCES,
  NOTIFICATION_KINDS,
  PUSH_CATEGORIES,
  pushRouteOf,
  shouldPushKind,
} from "./categories";

describe("pushRouteOf", () => {
  it("routes every kind the server writes", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(pushRouteOf(kind)).toBeDefined();
    }
  });

  it("uses only the switches the settings screens show, plus always", () => {
    const routes = new Set(NOTIFICATION_KINDS.map((kind) => pushRouteOf(kind)));
    for (const route of routes) {
      expect([...PUSH_CATEGORIES, "always"]).toContain(route);
    }
  });

  it("gives every switch at least one kind, so none is a dead control", () => {
    const routes = new Set(NOTIFICATION_KINDS.map((kind) => pushRouteOf(kind)));
    for (const category of PUSH_CATEGORIES) {
      expect(routes.has(category)).toBe(true);
    }
  });

  it("keeps the security alert out of reach of every switch", () => {
    expect(pushRouteOf("phone_transferred")).toBe("always");
  });

  it.each(["other", "", "settlement_offset", "EXPENSE_ADDED"])("does not route %s", (kind) => {
    expect(pushRouteOf(kind)).toBeUndefined();
  });
});

describe("shouldPushKind", () => {
  const allOff = { expenses: false, comments: false, payments: false, groups: false, friends: false };

  it("sends everything by default", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(shouldPushKind(kind, DEFAULT_PUSH_PREFERENCES)).toBe(true);
    }
  });

  it("honours a switch that is off", () => {
    expect(shouldPushKind("expense_added", { ...DEFAULT_PUSH_PREFERENCES, expenses: false })).toBe(false);
    expect(shouldPushKind("reminder", { ...DEFAULT_PUSH_PREFERENCES, payments: false })).toBe(false);
    expect(shouldPushKind("simplify_debts", { ...DEFAULT_PUSH_PREFERENCES, groups: false })).toBe(false);
  });

  it("still sends the security alert with every switch off", () => {
    expect(shouldPushKind("phone_transferred", allOff)).toBe(true);
  });

  it("fails closed on an unknown kind", () => {
    expect(shouldPushKind("marketing", DEFAULT_PUSH_PREFERENCES)).toBe(false);
  });
});
