/** Real Postgres erasure regression: original identity disappears, shared currency balances do not. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_deletion_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const ACCOUNT_ID = "erased-account";
const FRIEND_ID = "surviving-friend";

/**
 * Allows the suite to run against an explicitly supplied disposable database.
 * @returns Whether Postgres is reachable.
 */
async function databaseReachable() {
  const database = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await database.connect(); await database.end(); return true; } catch { return false; }
}

/**
 * Seeds personal tables and two currencies of shared ledger history.
 * @param database Connected disposable database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(`INSERT INTO users (id, email, phone, name, avatar_color, google_sub, password_hash)
    VALUES ($1, 'erase@example.com', '+14155552671', 'Private Member', '#c73e2e', 'google-erased', NULL),
      ($2, 'friend@example.com', NULL, 'Friend', '#0f8a5f', 'google-friend', NULL)`, [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO groups (id, name, created_by) VALUES ('shared-group', 'Private trip', $1)", [ACCOUNT_ID]);
  await database.query("INSERT INTO group_members (group_id, user_id, role) VALUES ('shared-group', $1, 'owner'), ('shared-group', $2, 'member')", [ACCOUNT_ID, FRIEND_ID]);
  await database.query(`INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by, notes)
    VALUES ('dollars', 'shared-group', 'Private receipt', 1000, 'USD', '2026-10-01', 'equal', $1, 'Private note'),
    ('euros', 'shared-group', 'Dinner', 500, 'EUR', '2026-10-02', 'equal', $2, '')`, [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('dollars', $1, 1000), ('euros', $2, 500)", [ACCOUNT_ID, FRIEND_ID]);
  await database.query(`INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES
    ('dollars', $1, 500), ('dollars', $2, 500), ('euros', $1, 250), ('euros', $2, 250)`, [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO expense_items (id, expense_id, name, total_cents) VALUES ('receipt-item', 'dollars', 'Private item', 1000)");
  await database.query("INSERT INTO expense_item_assignments (item_id, user_id) VALUES ('receipt-item', $1)", [ACCOUNT_ID]);
  await database.query("INSERT INTO net_settlements (id, currency, cash_cents, offset_cents) VALUES ('net-payment', 'USD', 100, 50)");
  await database.query(`INSERT INTO settlements (id, from_user, to_user, amount_cents, currency, recorded_by, note, method, method_label, net_settlement_id)
    VALUES ('payment', $2, $1, 100, 'USD', $1, 'Private payment note', 'cash', 'Private Member checking', 'net-payment'),
      ('offset-first', $1, $2, 50, 'USD', $1, '', 'offset', '', 'net-payment'),
      ('offset-second', $2, $1, 50, 'USD', $1, '', 'offset', '', 'net-payment')`, [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO comments (id, expense_id, user_id, body) VALUES ('private-comment', 'dollars', $1, 'Private comment'), ('friend-comment', 'dollars', $2, 'Thanks')", [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)", [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO friend_requests (requester_id, recipient_id) VALUES ($1, $2)", [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO payment_handles (user_id, method, handle) VALUES ($1, 'venmo', 'private-member')", [ACCOUNT_ID]);
  await database.query("INSERT INTO payment_methods (id, user_id, name) VALUES ('private-method', $1, 'Private Member checking')", [ACCOUNT_ID]);
  await database.query("INSERT INTO payment_method_details (method_id, position, kind, value) VALUES ('private-method', 0, 'account_name', 'Private Member')");
  await database.query("INSERT INTO payment_method_removals (user_id) VALUES ($1)", [ACCOUNT_ID]);
  await database.query("INSERT INTO receipt_scans (id, user_id, outcome) VALUES ('private-scan', $1, 'parsed')", [ACCOUNT_ID]);
  await database.query("INSERT INTO phone_verifications (user_id, phone, expires_at) VALUES ($1, '+14155552671', NOW() + INTERVAL '5 minutes')", [ACCOUNT_ID]);
  await database.query("INSERT INTO invite_links (token, kind, inviter_id) VALUES ($1, 'profile', $2)", ["x".repeat(43), ACCOUNT_ID]);
  await database.query("INSERT INTO activity (id, actor_id, type, message, audience, link) VALUES ('private-activity', $1, 'expense_added', 'Private Member added a receipt', jsonb_build_array($1::text, $2::text), '/expenses/dollars')", [ACCOUNT_ID, FRIEND_ID]);
  await database.query("INSERT INTO notifications (id, user_id, type, title, body, link) VALUES ('private-notification', $1, 'expense_added', 'Private Member added an expense', 'Private details', '/expenses/dollars')", [FRIEND_ID]);
}

/**
 * Reads actual per-user, per-currency ledger totals before and after erasure.
 * @param database Connected disposable database.
 * @returns Sorted monetary records, with Postgres bigint values kept exact as strings.
 */
async function ledgerSnapshot(database: Client) {
  return (await database.query<{ user_id: string; currency: string; cents: string }>(`SELECT user_id, currency, SUM(cents)::text AS cents FROM (
    SELECT pay.user_id, expense.currency, pay.amount_cents AS cents FROM expense_payers pay JOIN expenses expense ON expense.id = pay.expense_id
    UNION ALL SELECT split.user_id, expense.currency, -split.owed_cents FROM expense_splits split JOIN expenses expense ON expense.id = split.expense_id
    UNION ALL SELECT from_user, currency, amount_cents FROM settlements
    UNION ALL SELECT to_user, currency, -amount_cents FROM settlements
  ) entries GROUP BY user_id, currency ORDER BY user_id, currency`)).rows;
}

describe.skipIf(!await databaseReachable())("permanent account deletion against Postgres", () => {
  let database: Client;
  let deletion: typeof import("../../usecase/deletion/accountDeletion.usecase").deleteAccount;
  let sessionUser: typeof import("../../usecase/account/auth.usecase").sessionUser;
  let originalToken: string;
  let before: Awaited<ReturnType<typeof ledgerSnapshot>>;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`); await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    const infrastructure = await import("@/server/common/db/db"); await infrastructure.ensureMigrated();
    database = new Client({ connectionString: TEST_URL }); await database.connect(); await seed(database);
    const auth = await import("../../usecase/account/auth.usecase");
    sessionUser = auth.sessionUser; originalToken = (await import("@/server/auth/usecase/session/session")).createToken(ACCOUNT_ID, 0);
    deletion = (await import("../../usecase/deletion/accountDeletion.usecase")).deleteAccount;
    before = await ledgerSnapshot(database);
    await deletion(ACCOUNT_ID, "DELETE");
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } }; await cache.__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`); await admin.end();
  });

  it("hard-deletes the original account and invalidates its outstanding session", async () => {
    expect((await database.query("SELECT * FROM users WHERE id = $1", [ACCOUNT_ID])).rows).toEqual([]);
    expect(await sessionUser(originalToken)).toBeNull();
  });
  it("preserves every currency's cents under a new identity-free ledger participant", async () => {
    const anonymous = (await database.query("SELECT * FROM users WHERE deleted_at IS NOT NULL")).rows[0];
    expect(anonymous.id).not.toBe(ACCOUNT_ID);
    expect(anonymous).toMatchObject({ name: "Deleted member", email: null, phone: null, google_sub: null, apple_sub: null, password_hash: null, avatar_url: null });
    const after = await ledgerSnapshot(database);
    const remapped = after.map((entry) => ({ ...entry, user_id: entry.user_id === anonymous.id ? ACCOUNT_ID : entry.user_id }));
    expect(remapped.sort((first, second) => `${first.user_id}:${first.currency}`.localeCompare(`${second.user_id}:${second.currency}`))).toEqual(before);
  });
  it("erases personal content and transfers ownership without deleting the surviving member's comment", async () => {
    expect((await database.query("SELECT created_by, name FROM groups WHERE id = 'shared-group'")).rows[0]).toEqual({ created_by: FRIEND_ID, name: "Shared group" });
    expect((await database.query("SELECT role FROM group_members WHERE user_id = $1", [FRIEND_ID])).rows[0].role).toBe("owner");
    expect((await database.query("SELECT description, notes FROM expenses WHERE id = 'dollars'")).rows[0]).toEqual({ description: "Deleted expense", notes: "" });
    expect((await database.query("SELECT name FROM expense_items WHERE id = 'receipt-item'")).rows[0].name).toBe("Deleted item");
    expect((await database.query("SELECT id FROM comments")).rows).toEqual([{ id: "friend-comment" }]);
    expect((await database.query("SELECT COUNT(*)::int AS count FROM settlements WHERE net_settlement_id = 'net-payment'")).rows[0].count).toBe(3);
    expect((await database.query("SELECT note, method_label FROM settlements WHERE id = 'payment'")).rows[0]).toEqual({ note: "", method_label: "" });
    for (const table of ["friendships", "friend_requests", "payment_handles", "payment_methods", "payment_method_details", "payment_method_removals", "receipt_scans", "phone_verifications", "invite_links", "activity", "notifications"]) {
      expect((await database.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count).toBe(0);
    }
  });
});
