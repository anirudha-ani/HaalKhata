/** Group domain constants. */

/** Group categories the API accepts; anything else falls back to "other". */
export const GROUP_TYPES = new Set(["trip", "home", "couple", "other"]);

/** Role value marking a group's owner (creator); can invite/remove members. */
export const OWNER_ROLE = "owner";

/** Maximum persisted group-name length. Names fan out into activity and notifications. */
export const MAX_GROUP_NAME_LENGTH = 120;

/** Maximum member identifiers accepted by one create/add request. */
export const MAX_GROUP_MEMBER_IDS_PER_REQUEST = 100;
