/** All SQL for live splits and the people who have joined them. */

import type { PoolClient } from "pg";
import { execute, newId, query, queryOne } from "@/server/common/db/db";

/** One row of live_splits, with its link's token and whether its time is up. */
export interface LiveSplitRow {
  id: string;
  expense_id: string;
  host_id: string;
  started_at: string;
  ends_at: string;
  finished_at: string | null;
  new_expense: boolean;
  changed: boolean;
  /** The join link's token; "" once whoever started it deletes their account, which takes their links with it. */
  token: string;
  /** Whether its end has passed, by the database's clock. */
  due: boolean;
}

const LIVE_SPLIT_COLUMNS = `live.*, COALESCE(link.token, '') AS token, (live.ends_at <= now()) AS due`;
const LIVE_SPLIT_FROM = `live_splits live LEFT JOIN invite_links link ON link.live_split_id = live.id`;

/**
 * Stores a new live split.
 *
 * @param split - The expense, who started it, how long it runs, and whether
 *   the expense came into being with it.
 * @param client - The transaction starting it.
 * @returns The new split's id and when it ends.
 */
export async function insertLiveSplit(
  split: { expenseId: string; hostId: string; minutes: number; newExpense: boolean },
  client: PoolClient,
): Promise<{ id: string; ends_at: string }> {
  const rows = await query<{ id: string; ends_at: string }>(
    `INSERT INTO live_splits (id, expense_id, host_id, ends_at, new_expense)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4::int), $5)
     RETURNING id, ends_at`,
    [newId(), split.expenseId, split.hostId, split.minutes, split.newExpense],
    client,
  );
  return rows[0];
}

/**
 * The split running on an expense, its time up or not: only finishing one
 * lets another start.
 *
 * @param expenseId - The expense.
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns The split, or undefined.
 */
export async function findRunningLiveSplit(expenseId: string, client?: PoolClient): Promise<LiveSplitRow | undefined> {
  return queryOne<LiveSplitRow>(
    `SELECT ${LIVE_SPLIT_COLUMNS} FROM ${LIVE_SPLIT_FROM}
      WHERE live.expense_id = $1 AND live.finished_at IS NULL`,
    [expenseId],
    client,
  );
}

/**
 * One split by id, finished or not.
 *
 * @param liveSplitId - Its id.
 * @param client - Transaction client; omitted, the pool.
 * @returns The split, or undefined.
 */
export async function findLiveSplitById(liveSplitId: string, client?: PoolClient): Promise<LiveSplitRow | undefined> {
  return queryOne<LiveSplitRow>(
    `SELECT ${LIVE_SPLIT_COLUMNS} FROM ${LIVE_SPLIT_FROM} WHERE live.id = $1`,
    [liveSplitId],
    client,
  );
}

/**
 * Who has joined a split, in the order they came.
 *
 * @param liveSplitId - The split.
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns Their user ids.
 */
export async function listLiveSplitPeople(liveSplitId: string, client?: PoolClient): Promise<string[]> {
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM live_split_people WHERE live_split_id = $1 ORDER BY joined_at, user_id`,
    [liveSplitId],
    client,
  );
  return rows.map((person) => person.user_id);
}

/**
 * Whether somebody is in a split still within its time on an expense.
 *
 * @param expenseId - The expense.
 * @param userId - The person.
 * @param client - Transaction client; omitted, the pool.
 * @returns True when they have joined it.
 */
export async function isInLiveSplit(expenseId: string, userId: string, client?: PoolClient): Promise<boolean> {
  return (await queryOne(
    `SELECT 1 AS joined FROM live_splits live
       JOIN live_split_people person ON person.live_split_id = live.id
      WHERE live.expense_id = $1 AND live.finished_at IS NULL AND live.ends_at > now() AND person.user_id = $2`,
    [expenseId, userId],
    client,
  )) !== undefined;
}

/**
 * Records somebody joining a split.
 *
 * @param liveSplitId - The split.
 * @param userId - Who joined.
 * @param client - The transaction joining them.
 * @returns True when they were not in it already.
 */
export async function insertLiveSplitPerson(liveSplitId: string, userId: string, client: PoolClient): Promise<boolean> {
  const rows = await query(
    `INSERT INTO live_split_people (live_split_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING user_id`,
    [liveSplitId, userId],
    client,
  );
  return rows.length > 0;
}

/**
 * Notes that somebody changed the expense while a split ran, so its end has
 * something to announce.
 *
 * @param liveSplitId - The split.
 * @param client - The transaction saving the change.
 */
export async function markLiveSplitChanged(liveSplitId: string, client: PoolClient): Promise<void> {
  await execute(`UPDATE live_splits SET changed = TRUE WHERE id = $1`, [liveSplitId], client);
}

/**
 * Finishes a split and forgets who was in it.
 *
 * @param liveSplitId - The split.
 * @param client - The transaction finishing it.
 */
export async function markLiveSplitFinished(liveSplitId: string, client: PoolClient): Promise<void> {
  await execute(`UPDATE live_splits SET finished_at = now() WHERE id = $1`, [liveSplitId], client);
  await execute(`DELETE FROM live_split_people WHERE live_split_id = $1`, [liveSplitId], client);
}

/**
 * The splits past their end and not finished yet, oldest first.
 *
 * @param limit - How many to take.
 * @returns Their expense ids.
 */
export async function listDueLiveSplitExpenses(limit: number): Promise<string[]> {
  const rows = await query<{ expense_id: string }>(
    `SELECT expense_id FROM live_splits WHERE finished_at IS NULL AND ends_at <= now() ORDER BY ends_at LIMIT $1`,
    [limit],
  );
  return rows.map((split) => split.expense_id);
}

/**
 * Puts every line nobody claimed on whoever paid, as real assignments. The
 * shares do not move: unclaimed lines already counted against them. It is
 * what makes the expense an ordinary one again once the split is over.
 *
 * @param expenseId - The expense.
 * @param client - The transaction finishing the split.
 */
export async function assignUnclaimedLines(expenseId: string, client: PoolClient): Promise<void> {
  await execute(
    `INSERT INTO expense_item_assignments (item_id, user_id, weight)
     SELECT item.id, payer.user_id, 1
       FROM expense_items item
       JOIN expense_payers payer ON payer.expense_id = item.expense_id
      WHERE item.expense_id = $1
        AND NOT EXISTS (SELECT 1 FROM expense_item_assignments assigned WHERE assigned.item_id = item.id)`,
    [expenseId],
    client,
  );
}

/**
 * Moves an expense's version on without changing the expense, so everyone
 * watching it reads it again: somebody joined, or the split ended.
 *
 * @param expenseId - The expense.
 * @param client - The transaction doing it.
 */
export async function bumpExpenseVersion(expenseId: string, client: PoolClient): Promise<void> {
  await execute(`UPDATE expenses SET version = version + 1 WHERE id = $1`, [expenseId], client);
}
