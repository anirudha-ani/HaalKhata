/** Group domain constants. */

/** Group categories the API accepts; anything else falls back to "other". */
export const GROUP_TYPES = new Set(["trip", "home", "couple", "other"]);

/** Role value marking a group's owner (creator); can invite/remove members. */
export const OWNER_ROLE = "owner";
