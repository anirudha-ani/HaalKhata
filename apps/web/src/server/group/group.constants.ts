/** Group domain constants. */

import { MEMBER_ROLE, OWNER_ROLE } from "@haalkhata/shared/group/roles";
import { MAX_GROUP_NAME_LENGTH } from "@haalkhata/shared/text/limits";

/** Group categories the API accepts; anything else falls back to "other". */
export const GROUP_TYPES = new Set(["trip", "home", "couple", "other"]);

/**
 * Role value marking a group's owner (creator); may remove other members.
 * Re-exported from the shared package so the clients gate their controls on
 * the same spelling the server writes.
 */
export { MEMBER_ROLE, OWNER_ROLE };

/**
 * Maximum persisted group-name length. Names fan out into activity and
 * notifications. Re-exported from the shared package so both clients bound
 * their inputs to the value the server enforces.
 */
export { MAX_GROUP_NAME_LENGTH };

/** Maximum member identifiers accepted by one create/add request. */
export const MAX_GROUP_MEMBER_IDS_PER_REQUEST = 100;

/**
 * Hard ceiling on a group's roster, enforced on the join-link path (§33b):
 * a leaked bearer link must not let a bot swarm grow a roster without
 * bound. Aligned with the 100-participant expense ceiling — a group larger
 * than that could never split one bill across everyone anyway.
 */
export const MAX_GROUP_MEMBERS = 100;
