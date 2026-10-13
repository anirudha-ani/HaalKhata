/** Archive popup decisions: explain blocked actions and confirm their shared consequences. */

import { describe, expect, it } from "vitest";
import { groupArchivePrompt } from "./archivePrompt";
import { ARCHIVE_GROUP_HINT, GROUP_ARCHIVE_ACTIONS } from "./archiving";
import { formatMoney } from "../money/money";
import { GroupStatus } from "./status";

const group = { groupName: "Weekend trip", currency: "USD", status: GroupStatus.ARCHIVED } as const;

describe("archive action popups", () => {
  it("explains unsettled balances even when the caller's own balance is zero", () => {
    const prompt = groupArchivePrompt({
      ...group,
      balances: [{ netCents: 0 }, { netCents: 1250 }, { netCents: -1250 }],
    });
    expect(prompt.confirmLabel).toBeNull();
    expect(prompt.detail).toContain(ARCHIVE_GROUP_HINT);
    expect(prompt.detail).toContain(formatMoney(1250, "USD"));
  });

  it("confirms archiving for everyone and describes access and restoration", () => {
    const prompt = groupArchivePrompt({ ...group, balances: [{ netCents: 0 }] });
    expect(prompt.title).toContain(group.groupName);
    expect(prompt.confirmLabel).toBe(GROUP_ARCHIVE_ACTIONS.archive);
    expect(prompt.detail).toContain("for every member");
    expect(prompt.detail).toContain("Archived groups");
    expect(prompt.detail).toContain("removes it from expense selectors");
    expect(prompt.detail).toContain("history stays available");
    expect(prompt.detail).toContain("Any member can unarchive it later");
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
