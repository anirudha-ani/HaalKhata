/** Archive views, eligibility, and group selection shared by web and mobile. */

import { GroupStatus } from "./status";

/** Group pathways shown in the groups tab. */
export const GROUP_ARCHIVE_VIEWS = [
  { status: GroupStatus.ACTIVE, label: "Active groups" },
  { status: GroupStatus.ARCHIVED, label: "Archived groups" },
] as const;

/** Empty-state wording for each archive pathway. */
export const GROUP_ARCHIVE_EMPTY = {
  active: "No active groups. Your archived groups are still available in Archived groups.",
  archived: "No archived groups yet. Archive a group once everyone is settled up.",
} as const;

/** Archive action labels shared by both apps. */
export const GROUP_ARCHIVE_ACTIONS = {
  archive: "Archive group",
  unarchive: "Unarchive group",
  saving: "Saving…",
  open: "Open group",
} as const;

/** Explains why an active group cannot yet be archived. */
export const ARCHIVE_GROUP_HINT = "Settle all group balances before archiving. Any member can archive this group.";

/** Explains how archived history can be used again. */
export const ARCHIVED_GROUP_HINT = "This group is archived. Unarchive it to add or change expenses and payments.";

/**
 * Selects a lifecycle pathway without losing its summary type. Missing or
 * unspecified status on older responses means active; unknown states stay hidden.
 *
 * @param groups - Group summaries returned by ListGroups.
 * @param status - Lifecycle state to select; defaults to active.
 * @returns Summaries belonging to the selected pathway.
 */
export function groupsByStatus<Summary extends { group?: { status?: GroupStatus } }>(
  groups: readonly Summary[],
  status: GroupStatus = GroupStatus.ACTIVE,
): Summary[] {
  return groups.filter((summary) => {
    if (!summary.group) return false;
    const storedStatus = summary.group.status;
    const groupStatus = storedStatus === undefined || storedStatus === GroupStatus.UNSPECIFIED
      ? GroupStatus.ACTIVE
      : storedStatus;
    return groupStatus === status;
  });
}

/**
 * Determines whether loaded member balances permit offering an archive action.
 * The server rechecks the full ledger under its lock before committing.
 *
 * @param balances - Member nets, or undefined while loading or on error.
 * @returns True when balances are loaded and every member is settled.
 */
export function allBalancesSettled(balances: readonly { netCents: number }[] | undefined): boolean {
  return balances !== undefined && balances.every((balance) => balance.netCents === 0);
}
