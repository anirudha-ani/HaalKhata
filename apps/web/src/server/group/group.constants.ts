/** Group domain constants. */

import { MEMBER_ROLE, OWNER_ROLE } from "@haalkhata/shared/group/roles";
import { MAX_GROUP_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";

/** Group categories the API accepts; anything else falls back to "other". */
export const GROUP_TYPES = new Set(["trip", "home", "couple", "other"]);

/** PostgreSQL enum spelling for each defined protobuf lifecycle state. */
export const GROUP_STATUS_STORAGE = {
  [GroupStatus.ACTIVE]: "active",
  [GroupStatus.ARCHIVED]: "archived",
  [GroupStatus.DELETED]: "deleted",
} as const;

/** Values accepted by the database's group_status enum. */
export type GroupStatusValue = (typeof GROUP_STATUS_STORAGE)[keyof typeof GROUP_STATUS_STORAGE];

/** Protobuf lifecycle state for each PostgreSQL enum value. */
export const GROUP_STATUS_PROTO = {
  active: GroupStatus.ACTIVE,
  archived: GroupStatus.ARCHIVED,
  deleted: GroupStatus.DELETED,
} satisfies Record<GroupStatusValue, GroupStatus>;

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

/**
 * AddMembers' refusal for an email or phone that belongs to nobody on
 * HaalKhata. The clients answer it with the group's invite link.
 */
export const NOT_ON_HAALKHATA_GROUP_MESSAGE =
  "they're not on HaalKhata yet — share this group's invite link so they can join";

/** Maximum member identifiers accepted by one create/add request. */
export const MAX_GROUP_MEMBER_IDS_PER_REQUEST = 100;

/**
 * Hard ceiling on a group's roster, enforced on the join-link path (§33b):
 * a leaked bearer link must not let a bot swarm grow a roster without
 * bound. Aligned with the 100-participant expense ceiling — a group larger
 * than that could never split one bill across everyone anyway.
 */
export const MAX_GROUP_MEMBERS = 100;
