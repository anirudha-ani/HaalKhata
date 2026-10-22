/** Wording of the group page's options menu, shared by web and mobile. */

/**
 * The "more" menu at the top right of a group's page. Archiving and
 * reporting are rare, deliberate acts, so they live behind it rather than
 * as buttons competing with the members strip and the ledger; the archive
 * entry itself is worded by `GROUP_ARCHIVE_ACTIONS`.
 */
export const GROUP_MENU_COPY = {
  trigger: "Group options",
  report: "Report group",
} as const;
