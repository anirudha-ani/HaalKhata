/** Archive popup decisions: explain blocked actions and confirm their shared consequences. */

import { describe, expect, it } from "vitest";
import { groupArchivePrompt } from "./archivePrompt";
import { ARCHIVE_GROUP_HINT, GROUP_ARCHIVE_ACTIONS } from "./archiving";
import { formatMoney } from "../money/money";
import { GroupStatus } from "./status";

const group = { groupName: "Weekend trip", status: GroupStatus.ARCHIVED } as const;

describe("archive action popups", () => {
  it("explains unsettled balances even when the caller's own balance is zero", () => {
    const prompt = groupArchivePrompt({
      ...group,
      balances: [{ currency: "USD", nets: [{ netCents: 0 }, { netCents: 1250 }, { netCents: -1250 }] }],
    });
    expect(prompt.confirmLabel).toBeNull();
    expect(prompt.detail).toContain(ARCHIVE_GROUP_HINT);
    expect(prompt.detail).toContain(formatMoney(1250, "USD"));
  });

  it("confirms archiving for everyone and describes access and restoration", () => {
    const prompt = groupArchivePrompt({ ...group, balances: [{ currency: "USD", nets: [{ netCents: 0 }] }] });
    expect(prompt.title).toContain(group.groupName);
    expect(prompt.confirmLabel).toBe(GROUP_ARCHIVE_ACTIONS.archive);
    expect(prompt.detail).toContain("for every member");
    expect(prompt.detail).toContain("Archived groups");
    expect(prompt.detail).toContain("removes it from expense selectors");
    expect(prompt.detail).toContain("history stays available");
    expect(prompt.detail).toContain("Any member can unarchive it later");
  });

  it("names what is left in each currency of a group holding two, never a sum", () => {
    // Settled in dollars, but a euro payment from before group payments were
    // kept to the group's currency still stands.
    const prompt = groupArchivePrompt({
      ...group,
      balances: [
        { currency: "USD", nets: [{ netCents: 0 }, { netCents: 0 }] },
        { currency: "EUR", nets: [{ netCents: -10000 }, { netCents: 10000 }] },
      ],
    });
    expect(prompt.confirmLabel).toBeNull();
    expect(prompt.detail).toContain(`There is still ${formatMoney(10000, "EUR")} to settle`);
    const both = groupArchivePrompt({
      ...group,
      balances: [
        { currency: "USD", nets: [{ netCents: 2500 }, { netCents: -2500 }] },
        { currency: "EUR", nets: [{ netCents: -10000 }, { netCents: 10000 }] },
      ],
    });
    expect(both.detail).toContain(`${formatMoney(2500, "USD")} and ${formatMoney(10000, "EUR")}`);
  });

  it("allows confirming an empty group", () => {
    expect(groupArchivePrompt({ ...group, balances: [] }).confirmLabel).toBe(
      GROUP_ARCHIVE_ACTIONS.archive,
    );
  });

  it("does not claim balances are unsettled when they have not loaded", () => {
    const prompt = groupArchivePrompt({ ...group, balances: undefined });
    expect(prompt.confirmLabel).toBeNull();
    expect(prompt.detail).toContain("could not be checked yet");
    expect(prompt.detail).not.toContain(ARCHIVE_GROUP_HINT);
  });

  it("confirms restoring the group without needing a balance check", () => {
    const prompt = groupArchivePrompt({ ...group, status: GroupStatus.ACTIVE, balances: undefined });
    expect(prompt.confirmLabel).toBe(GROUP_ARCHIVE_ACTIONS.unarchive);
    expect(prompt.detail).toContain("Active groups and expense selectors for every member");
  });
});
