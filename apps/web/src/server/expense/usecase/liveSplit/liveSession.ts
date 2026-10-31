/** What the expense code needs to know of a live split: whether one is open, and how to open one inside an expense's own transaction. */

import type { PoolClient } from "pg";
import { LIVE_SPLIT_MINUTES } from "@haalkhata/shared/expense/live/live.constants";
import {
  findRunningLiveSplit,
  insertLiveSplit,
  insertLiveSplitPerson,
  listLiveSplitPeople,
  listLiveSplitSavers,
  type LiveSplitRow,
} from "@/server/expense/repo/liveSplits.repo";
import { insertLiveSplitLink } from "@/server/social/repo/inviteLinks.repo";
import { newInviteToken } from "@/server/social/usecase/inviteToken";

/** A live split still within its time, with who is in it. */
export interface LiveSession {
  split: LiveSplitRow;
  peopleIds: string[];
  /** Who has pressed Save since it opened. */
  savedIds: string[];
}

/**
 * The live split open on an expense right now. One past its end does not
 * count, even before the sweep has got to it.
 *
 * @param expenseId - The expense.
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns The session, or null.
 */
export async function liveSessionOf(expenseId: string, client?: PoolClient): Promise<LiveSession | null> {
  const split = await findRunningLiveSplit(expenseId, client);
  if (!split || split.due) return null;
  return {
    split,
    peopleIds: await listLiveSplitPeople(split.id, client),
    savedIds: await listLiveSplitSavers(split.id, client),
  };
}

/**
 * Opens a live split on an expense, with its join link and whoever started it
 * already in it.
 *
 * @param expenseId - The expense.
 * @param hostId - Who started it.
 * @param newExpense - Whether the expense came into being with it.
 * @param client - The transaction, holding the expense's lock or creating it.
 */
export async function openLiveSession(expenseId: string, hostId: string, newExpense: boolean, client: PoolClient): Promise<void> {
  const split = await insertLiveSplit({ expenseId, hostId, minutes: LIVE_SPLIT_MINUTES, newExpense }, client);
  await insertLiveSplitLink({ token: newInviteToken(), inviterId: hostId, liveSplitId: split.id, endsAt: split.ends_at }, client);
  await insertLiveSplitPerson(split.id, hostId, client);
}
