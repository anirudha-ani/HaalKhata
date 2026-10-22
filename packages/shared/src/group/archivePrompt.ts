/** Archive and restore popup wording and decisions shared by web and mobile. */

import { allBalancesSettled, ARCHIVE_GROUP_HINT, GROUP_ARCHIVE_ACTIONS } from "./archiving";
import { formatMoney } from "../money/money";
import { GroupStatus, type GroupArchiveStatus } from "./status";

/** Button captions for archive popups. */
export const GROUP_ARCHIVE_DIALOG_ACTIONS = {
  cancel: "Cancel",
  close: "Close",
  balances: "See balances",
} as const;

/** The explanation or confirmation displayed after an archive button is pressed. */
export interface GroupArchivePrompt {
  /** Dialog heading. */
  title: string;
  /** Consequences of confirming, or why archiving cannot proceed. */
  detail: string;
  /** Confirm caption; null means the action is blocked. */
  confirmLabel: string | null;
}

/**
 * Chooses the archive popup without sending a mutation that is known to fail.
 * Restoration is always offered; archiving requires loaded, settled balances.
 *
 * @param input - Group name, currency, desired lifecycle status and current member nets.
 * @returns A confirmation with consequences, or an explanation with no confirm action.
 */
export function groupArchivePrompt(input: {
  groupName: string;
  currency: string;
  status: GroupArchiveStatus;
  balances: readonly { netCents: number }[] | undefined;
}): GroupArchivePrompt {
  if (input.status === GroupStatus.ACTIVE) {
    return {
      title: `Unarchive “${input.groupName}”?`,
      detail: "This restores the group to Active groups and expense selectors for every member. You can add or change expenses and payments again. All existing history stays available.",
      confirmLabel: GROUP_ARCHIVE_ACTIONS.unarchive,
    };
  }
  if (input.balances === undefined) {
    return {
      title: "Group balances unavailable",
      detail: "The group’s balances could not be checked yet. Open balances and try again once they are available.",
      confirmLabel: null,
    };
  }
  if (!allBalancesSettled(input.balances)) {
    const outstandingCents = input.balances.reduce(
      (running, balance) => running + Math.max(0, balance.netCents),
      0,
    );
    return {
      title: "This group cannot be archived yet",
      detail: `There is still ${formatMoney(outstandingCents, input.currency)} to settle in this group. ${ARCHIVE_GROUP_HINT}`,
      confirmLabel: null,
    };
  }
  return {
    title: `Archive “${input.groupName}”?`,
    detail: "This archives the group for every member, moves it to Archived groups, and removes it from expense selectors. Its history stays available. You must unarchive it before adding or changing expenses or payments. Any member can unarchive it later.",
    confirmLabel: GROUP_ARCHIVE_ACTIONS.archive,
  };
}
