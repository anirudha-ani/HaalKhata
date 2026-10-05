/** Values used when permanently erasing an account while preserving shared ledger amounts. */

/** Exact server confirmation required by the destructive RPC. */
export { ACCOUNT_DELETION_CONFIRMATION as DELETE_ACCOUNT_CONFIRMATION } from "@haalkhata/shared/account/deletion";
/** Public name for a fresh ledger-only participant. */
export const ANONYMOUS_MEMBER_NAME = "Deleted member";
/** Neutral avatar with no link to the deleted account's identity. */
export const ANONYMOUS_MEMBER_COLOR = "#6b7280";
/** Replacement for descriptions authored by the deleted account. */
export const DELETED_EXPENSE_DESCRIPTION = "Deleted expense";
/** Replacement for receipt item text authored by the deleted account. */
export const DELETED_ITEM_NAME = "Deleted item";
/** Replacement for group names authored by the deleted account. */
export const DELETED_GROUP_NAME = "Shared group";
