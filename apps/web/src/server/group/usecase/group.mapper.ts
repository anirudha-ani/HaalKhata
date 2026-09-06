/** Group rows → group.v1 message init shapes. */

import type { GroupRow, MemberRow } from "@/server/group/repo/groups.repo";
import { toPublicUser } from "@/server/auth/usecase/user.mapper";

/**
 * Maps a member row (user + role) to a group.v1 Member message init shape.
 *
 * @param memberRow - Joined user row carrying the member's group role.
 * @returns An object matching the Member proto message fields.
 */
export function toMember(memberRow: MemberRow) {
  return { user: toPublicUser(memberRow), role: memberRow.role };
}

/**
 * Maps a group row (and optionally its members) to a group.v1 Group message
 * init shape.
 *
 * @param groupRow - The groups table row to convert.
 * @param members - Member rows to embed; omitted means an empty members list.
 * @returns An object matching the Group proto message fields.
 */
export function toGroup(groupRow: GroupRow, members?: MemberRow[]) {
  return {
    id: groupRow.id,
    name: groupRow.name,
    type: groupRow.type,
    currency: groupRow.currency,
    createdBy: groupRow.created_by,
    createdAt: groupRow.created_at,
    members: members?.map(toMember) ?? [],
    simplifyDebts: groupRow.simplify_debts,
  };
}
