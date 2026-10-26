/** Wording of a person's options menu, shared by web and mobile. */

/**
 * The "more" menu at the top right of a person's page. Reporting and
 * blocking are rare, deliberate acts, so they live behind it rather than as
 * links above the page; `blocked` is the line shown under the name once a
 * block is in place, where the block entry used to be.
 */
export const PERSON_MENU_COPY = {
  trigger: "More options",
  report: "Report person",
  block: "Block person",
  blocked: "Blocked",
  /** Under the name of the stand-in a deleted account left in shared history. */
  deleted: "Deleted their account",
} as const;
