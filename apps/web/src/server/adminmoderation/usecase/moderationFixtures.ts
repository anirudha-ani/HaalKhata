/**
 * Seed data for the moderation integration tests: people, a group, an
 * expense with items and notes, comments, feed lines, notifications and a
 * spread of reports, with every value a person would call private made
 * distinctive enough to search for.
 */

import type { Client } from "pg";

/** The person whose content is reported. */
export const AUTHOR = "user-author-c3a1";
/** The person who reports most things. */
export const REPORTER = "user-reporter-a1b2";
/** A second person reporting the same comment. */
export const SECOND_REPORTER = "user-reporter-b2c3";
/** Someone whose display name is an email address. */
export const EMAIL_NAMED = "user-emailnamed-d4e5";

/** The reported comment, expense and group. */
export const COMMENT_ID = "cmt-reported-0001";
export const SPAM_COMMENT_ID = "cmt-spam-0002";
export const OWN_COMMENT_ID = "cmt-reporter-0003";
export const EXPENSE_ID = "exp-reported-0001";
export const GROUP_ID = "grp-reported-0001";
/** Another expense in the reported group, by the reporter. */
export const GROUP_EXPENSE_ID = "exp-in-group-0002";

/** Reports, in the order they were made. UUIDs, as the server mints them. */
export const REPORTS = {
  commentFirst: "11111111-1111-4111-8111-111111111111",
  expense: "22222222-2222-4222-8222-222222222222",
  commentSecond: "33333333-3333-4333-8333-333333333333",
  group: "44444444-4444-4444-8444-444444444444",
  profile: "55555555-5555-4555-8555-555555555555",
  spamComment: "66666666-6666-4666-8666-666666666666",
  oldClosed: "88888888-8888-4888-8888-888888888888",
} as const;

/** The reported words, which the queue is meant to show. */
export const REPORTED_WORDS = {
  comment: "Offensive comment body",
  description: "Offensive expense description",
  notes: "Offensive expense notes",
  item: "Offensive item name",
  groupName: "Offensive group name",
  profileName: "Author Person",
} as const;

/** Everything seeded that the queue must never contain. */
export const PRIVATE_VALUES = [
  AUTHOR,
  REPORTER,
  SECOND_REPORTER,
  EMAIL_NAMED,
  COMMENT_ID,
  SPAM_COMMENT_ID,
  OWN_COMMENT_ID,
  EXPENSE_ID,
  GROUP_ID,
  GROUP_EXPENSE_ID,
  "Reporter Person",
  "Second Reporter",
  "author.private@example.com",
  "reporter.private@example.com",
  "second.private@example.com",
  "named.private@example.com",
  "author.typed@example.com",
  "+14155550123",
  "https://lh3.googleusercontent.com/author-picture",
  "google-sub-author",
  "author-venmo-handle",
  "Reporter's own comment",
  "98765",
  "49383",
  "49382",
];

/**
 * Seeds the moderation scenario on an already migrated database.
 *
 * @param database - Connected client on the test database.
 */
export async function seedModeration(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, phone, name, avatar_color, avatar_url, google_sub, onboarded_at) VALUES
       ($1, 'author.private@example.com', '+14155550123', 'Author Person', '#0f8a5f',
        'https://lh3.googleusercontent.com/author-picture', 'google-sub-author', now()),
       ($2, 'reporter.private@example.com', NULL, 'Reporter Person', '#1d4ed8', NULL, 'google-sub-reporter', now()),
       ($3, 'second.private@example.com', NULL, 'Second Reporter', '#7c3aed', NULL, 'google-sub-second', now()),
       ($4, 'named.private@example.com', NULL, 'author.typed@example.com', '#857a68', NULL, 'google-sub-named', now())`,
    [AUTHOR, REPORTER, SECOND_REPORTER, EMAIL_NAMED],
  );
  await database.query(`INSERT INTO groups (id, name, type, created_by) VALUES ($1, $2, 'trip', $3)`, [
    GROUP_ID,
    REPORTED_WORDS.groupName,
    AUTHOR,
  ]);
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
    [GROUP_ID, AUTHOR, REPORTER],
  );
  await database.query(
    `INSERT INTO expenses (id, group_id, description, notes, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ($1, $2, $3, $4, 98765, 'USD', '2026-10-01', 'equal', $5)`,
    [EXPENSE_ID, GROUP_ID, REPORTED_WORDS.description, REPORTED_WORDS.notes, AUTHOR],
  );
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ($1, $2, 'Groceries', 1234, 'USD', '2026-10-02', 'equal', $3)`,
    [GROUP_EXPENSE_ID, GROUP_ID, REPORTER],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, 98765)`,
    [EXPENSE_ID, AUTHOR],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, 49383), ($1, $3, 49382)`,
    [EXPENSE_ID, AUTHOR, REPORTER],
  );
  await database.query(
    `INSERT INTO expense_items (id, expense_id, name, total_cents) VALUES ('item-reported-1', $1, $2, 98765)`,
    [EXPENSE_ID, REPORTED_WORDS.item],
  );
  await database.query(
    `INSERT INTO comments (id, expense_id, user_id, body) VALUES
       ($1, $4, $5, $6), ($2, $4, $7, 'Buy cheap followers now'), ($3, $4, $8, 'Reporter''s own comment')`,
    [COMMENT_ID, SPAM_COMMENT_ID, OWN_COMMENT_ID, EXPENSE_ID, AUTHOR, REPORTED_WORDS.comment, EMAIL_NAMED, REPORTER],
  );
  await database.query(
    `INSERT INTO activity (id, group_id, actor_id, type, message, audience, link) VALUES
       ('act-author-1', $1, $2, 'comment', 'Author Person: Offensive comment body', jsonb_build_array($2::text, $3::text), '/expenses/' || $4),
       ('act-reporter-1', NULL, $3, 'comment', 'Reporter wrote elsewhere', jsonb_build_array($3::text), '/expenses/elsewhere'),
       ('act-author-2', NULL, $2, 'comment', 'Author Person commented elsewhere', jsonb_build_array($2::text, $3::text), '/expenses/elsewhere'),
       ('act-author-3', NULL, $2, 'expense_added', 'Author Person added "Taxi"', jsonb_build_array($2::text, $3::text), '/expenses/elsewhere'),
       ('act-expense-1', $1, $3, 'expense_updated', 'Reporter Person updated "Offensive expense description" in "Offensive group name"', jsonb_build_array($2::text, $3::text), '/expenses/' || $4),
       ('act-group-1', $1, $3, 'expense_added', 'Reporter Person added "Groceries" in "Offensive group name"', jsonb_build_array($2::text, $3::text), '/expenses/' || $5),
       ('act-group-comment-1', $1, $3, 'comment', 'Reporter Person commented on "Groceries": see you there', jsonb_build_array($2::text, $3::text), '/expenses/' || $5)`,
    [GROUP_ID, AUTHOR, REPORTER, EXPENSE_ID, GROUP_EXPENSE_ID],
  );
  // Lines that name the author although someone else did the thing, and one
  // that quotes the same name about somebody else, out of the author's sight.
  // The near-name lines carry the name inside a longer word, which is not
  // the author.
  await database.query(
    `INSERT INTO activity (id, group_id, actor_id, type, message, audience, link) VALUES
       ('act-names-author-1', NULL, $2, 'settlement', 'Reporter Person paid Author Person $20.00', jsonb_build_array($1::text, $2::text), '/friends/' || $1),
       ('act-names-author-2', NULL, $2, 'member_added', 'Reporter Person added Author Person and Second Reporter to "Weekend"', jsonb_build_array($1::text, $2::text, $3::text), '/groups/grp-weekend-0003'),
       ('act-names-author-3', NULL, $2, 'member_added', 'Reporter Person joined through Author Person''s invite', jsonb_build_array($1::text, $2::text), '/friends/' || $1),
       ('act-near-name-1', NULL, $2, 'expense_added', 'Reporter Person added "Author Personality quiz"', jsonb_build_array($1::text, $2::text), '/expenses/quiz'),
       ('act-namesake-1', NULL, $3, 'settlement', 'Second Reporter paid Author Person $5.00', jsonb_build_array($2::text, $3::text), '/friends/' || $2)`,
    [AUTHOR, REPORTER, SECOND_REPORTER],
  );
  await database.query(
    `INSERT INTO notifications (id, user_id, actor_id, type, title, body, link) VALUES
       ('ntf-names-author-1', $2, $1, 'member_added', 'Reporter Person added Author Person to "Weekend"', '', '/groups/grp-weekend-0003'),
       ('ntf-names-author-2', $1, $2, 'expense_added', 'Second Reporter added "Taxi"', 'One-off expense · you owe Author Person $3.00', '/expenses/elsewhere'),
       ('ntf-near-name-1', $1, $2, 'expense_added', 'Reporter Person added "Author Personality quiz"', 'One-off expense · you owe $4.00', '/expenses/quiz'),
       ('ntf-namesake-1', $1, $2, 'settlement', 'Second Reporter recorded a payment', 'Paid to Author Person', '/friends/' || $2)`,
    [REPORTER, SECOND_REPORTER],
  );
  await database.query(
    `INSERT INTO notifications (id, user_id, actor_id, type, title, body, link) VALUES
       ('ntf-author-1', $1, $2, 'comment', 'Author Person commented', 'Offensive comment body', '/expenses/' || $3),
       ('ntf-other-1', $2, $1, 'comment', 'Reporter commented', 'Ordinary words', '/expenses/elsewhere'),
       ('ntf-author-2', $1, $2, 'settlement', 'Author Person paid you', 'Settlement', '/friends/' || $2),
       ('ntf-group-1', $2, $1, 'member_added', 'Reporter Person added you', 'Offensive group name', '/groups/' || $4),
       ('ntf-group-expense-1', $2, $1, 'expense_added', 'Reporter Person added "Groceries"', 'Offensive group name · you owe Reporter Person $6.17', '/expenses/' || $5),
       ('ntf-group-comment-1', $2, $1, 'comment', 'Reporter Person commented on "Groceries"', 'see you there', '/expenses/' || $5)`,
    [REPORTER, AUTHOR, EXPENSE_ID, GROUP_ID, GROUP_EXPENSE_ID],
  );
  await database.query(
    `INSERT INTO payment_handles (user_id, method, handle) VALUES ($1, 'venmo', 'author-venmo-handle')`,
    [AUTHOR],
  );
  await database.query(
    `INSERT INTO content_reports (id, reporter_id, reported_user_id, target_kind, target_id, reason, snapshot, status, created_at, resolved_at) VALUES
       ($1, $8, $10, 'comment', $12, 'harassment', jsonb_build_object('body', $15::text, 'expenseId', $13::text), 'open', now() - interval '3 days', NULL),
       ($2, $8, $10, 'expense', $13, 'spam', jsonb_build_object('description', $16::text, 'notes', $17::text, 'items', jsonb_build_array($18::text)), 'open', now() - interval '2 days', NULL),
       ($3, $9, $10, 'comment', $12, 'hate', jsonb_build_object('body', $15::text, 'expenseId', $13::text), 'open', now() - interval '1 day', NULL),
       ($4, $8, $10, 'group', $14, 'other', jsonb_build_object('name', $19::text), 'open', now() - interval '2 hours', NULL),
       ($5, $8, $10, 'user', $10, 'harassment', jsonb_build_object('name', $20::text), 'open', now() - interval '1 hour', NULL),
       ($6, $8, $11, 'comment', $21, 'spam', jsonb_build_object('body', 'Buy cheap followers now', 'expenseId', $13::text), 'open', now() - interval '30 minutes', NULL),
       ($7, $9, $10, 'user', $10, 'spam', jsonb_build_object('name', 'Old Name'), 'dismissed', now() - interval '90 days', now() - interval '89 days')`,
    [
      REPORTS.commentFirst,
      REPORTS.expense,
      REPORTS.commentSecond,
      REPORTS.group,
      REPORTS.profile,
      REPORTS.spamComment,
      REPORTS.oldClosed,
      REPORTER,
      SECOND_REPORTER,
      AUTHOR,
      EMAIL_NAMED,
      COMMENT_ID,
      EXPENSE_ID,
      GROUP_ID,
      REPORTED_WORDS.comment,
      REPORTED_WORDS.description,
      REPORTED_WORDS.notes,
      REPORTED_WORDS.item,
      REPORTED_WORDS.groupName,
      REPORTED_WORDS.profileName,
      SPAM_COMMENT_ID,
    ],
  );
}

/**
 * Reads everything a removal can change, in a form two databases can be
 * compared by: the content, the quotations of it, and the money beside it.
 *
 * @param database - Connected client on a seeded database.
 * @returns The state, rows ordered by id.
 */
export async function contentState(database: Client) {
  const read = async (statement: string) => (await database.query(statement)).rows;
  return {
    comments: await read("SELECT id, user_id, body FROM comments ORDER BY id"),
    expenses: await read("SELECT id, description, notes, amount_cents FROM expenses ORDER BY id"),
    items: await read("SELECT id, name, total_cents FROM expense_items ORDER BY id"),
    groups: await read("SELECT id, name FROM groups ORDER BY id"),
    users: await read("SELECT id, name, avatar_url, email, suspended_at IS NOT NULL AS suspended FROM users ORDER BY id"),
    handles: await read("SELECT user_id, method, handle FROM payment_handles ORDER BY user_id, method"),
    activity: await read("SELECT id, message FROM activity ORDER BY id"),
    notifications: await read("SELECT id, title, body FROM notifications ORDER BY id"),
    splits: await read("SELECT expense_id, user_id, owed_cents FROM expense_splits ORDER BY expense_id, user_id"),
    payers: await read("SELECT expense_id, user_id, amount_cents FROM expense_payers ORDER BY expense_id, user_id"),
  };
}
