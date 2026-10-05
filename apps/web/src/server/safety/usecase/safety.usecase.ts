/** Authorized private reporting and blocking independent of monetary balances. */

import { REPORT_REASONS, REPORT_TARGET_KINDS } from "@haalkhata/shared/safety/safety";
import { invalid, notFound } from "@/server/common/errors";
import { transaction } from "@/server/common/db";
import { findUserById } from "@/server/auth/repo/users.repo";
import { toPublicUser } from "@/server/auth/usecase/user.mapper";
import { findGroupById, isMember } from "@/server/group/repo/groups.repo";
import { getExpense } from "@/server/expense/usecase/expense.usecase";
import * as safety from "../repo/safety.repo";

/**
 * Blocks an account already visible to the caller; money remains intact.
 * @param viewerId Authenticated caller.
 * @param targetId Account to block.
 */
export async function blockUser(viewerId: string, targetId: string): Promise<void> {
  if (targetId === viewerId) invalid("you cannot block yourself");
  if (!await safety.visibleUser(viewerId, targetId)) notFound("person not found");
  await transaction((client) => safety.insertBlock(viewerId, targetId, client));
}

/**
 * Unblocks an account without altering the other person's preferences.
 * @param viewerId Caller.
 * @param targetId Account to unblock.
 */
export async function unblockUser(viewerId: string, targetId: string): Promise<void> {
  await safety.removeBlock(viewerId, targetId);
}

/**
 * Lists the caller's own blocks, using the minimal public profile projection.
 * @param viewerId Caller.
 * @returns Blocked accounts.
 */
export async function listBlockedUsers(viewerId: string) {
  return { users: (await safety.listBlocks(viewerId)).map(toPublicUser) };
}

/**
 * Authorizes a report against existing content and saves the original server text.
 * @param viewerId Authenticated reporter.
 * @param input Target and allowed reason, never caller-supplied content.
 */
export async function reportContent(viewerId: string, input: { targetKind: string; targetId: string; reason: string }): Promise<void> {
  if (!REPORT_TARGET_KINDS.some((kind) => kind === input.targetKind) || !REPORT_REASONS.some((reason) => reason.value === input.reason)) {
    invalid("choose a valid report reason and content type");
  }
  let target: safety.ReportTarget;
  if (input.targetKind === "comment") {
    const comment = await safety.commentTarget(input.targetId);
    if (!comment) notFound("comment not found");
    await getExpense(viewerId, comment.expense_id);
    target = { author_id: comment.user_id, snapshot: { body: comment.body, expenseId: comment.expense_id } };
  } else if (input.targetKind === "expense") {
    const detail = await getExpense(viewerId, input.targetId);
    target = { author_id: detail.expense.createdBy, snapshot: { description: detail.expense.description, notes: detail.expense.notes,
      items: detail.expense.items.map((item) => item.name) } };
  } else if (input.targetKind === "group") {
    if (!await isMember(input.targetId, viewerId)) notFound("group not found");
    const group = await findGroupById(input.targetId);
    if (!group) notFound("group not found");
    target = { author_id: group.created_by, snapshot: { name: group.name } };
  } else {
    if (!await safety.visibleUser(viewerId, input.targetId)) notFound("person not found");
    const person = await findUserById(input.targetId);
    if (!person) notFound("person not found");
    target = { author_id: person.id, snapshot: { name: person.name } };
  }
  await safety.insertReport(viewerId, { ...input, target });
}
