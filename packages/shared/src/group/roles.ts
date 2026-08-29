/** Group membership roles as the API spells them — shared so both clients gate the same controls. */

/**
 * Role held by a group's creator. The owner may remove other members; a
 * non-owner may only remove themselves. Mirrors `group_members.role`.
 */
export const OWNER_ROLE = "owner";
