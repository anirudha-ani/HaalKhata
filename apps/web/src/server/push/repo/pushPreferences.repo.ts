/** All SQL for push_preferences: which push categories a person wants. */

import { query, queryOne } from "@/server/common/db/db";

/** A row from push_preferences (column names mirror SQL). */
export interface PushPreferencesRow {
  user_id: string;
  expenses: boolean;
  comments: boolean;
  payments: boolean;
  groups: boolean;
  friends: boolean;
  updated_at: string;
}

/** The five switches, as written. */
export interface PushPreferenceColumns {
  expenses: boolean;
  comments: boolean;
  payments: boolean;
  groups: boolean;
  friends: boolean;
}

/**
 * One person's switches.
 *
 * @param userId - The person.
 * @returns Their row, or undefined when they never chose (everything on).
 */
export async function findPushPreferences(userId: string): Promise<PushPreferencesRow | undefined> {
  return queryOne<PushPreferencesRow>(`SELECT * FROM push_preferences WHERE user_id = $1`, [userId]);
}

/**
 * The switches of several people, for one dispatch batch.
 *
 * @param userIds - Recipients in the batch.
 * @returns Rows for those who ever chose; the rest have everything on.
 */
export async function listPushPreferences(userIds: string[]): Promise<PushPreferencesRow[]> {
  if (userIds.length === 0) return [];
  return query<PushPreferencesRow>(`SELECT * FROM push_preferences WHERE user_id = ANY($1::text[])`, [userIds]);
}

/**
 * Replaces one person's switches.
 *
 * @param userId - The person.
 * @param values - All five switches.
 * @returns The stored row.
 */
export async function savePushPreferences(userId: string, values: PushPreferenceColumns): Promise<PushPreferencesRow> {
  const stored = await queryOne<PushPreferencesRow>(
    `INSERT INTO push_preferences (user_id, expenses, comments, payments, groups, friends)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE
       SET expenses = EXCLUDED.expenses, comments = EXCLUDED.comments, payments = EXCLUDED.payments,
           groups = EXCLUDED.groups, friends = EXCLUDED.friends, updated_at = now()
     RETURNING *`,
    [userId, values.expenses, values.comments, values.payments, values.groups, values.friends],
  );
  return stored!;
}
