/** Adds repeatable local demo data through the real Connect API without replacing existing rows. */

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { GroupService } from "@haalkhata/protogen/group/v1/group_pb";
import { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import { BEARER_TRANSPORT, SESSION_TRANSPORT_HEADER } from "@haalkhata/shared/auth/sessionRenewal";
import { readSecret } from "../src/server/common/secrets";

/** Host-only API endpoint; this command never targets a deployed application. */
const API_URL = "http://127.0.0.1:3000/api/connect";
/** Database hosts accepted by the local-only seed command. */
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "db"]);
/** Fictional contacts; their reserved example.test email domains cannot deliver mail. */
const DEMO_PEOPLE = [
  { slug: "avery", name: "Avery Morgan" },
  { slug: "nila", name: "Nila Rahman" },
  { slug: "leo", name: "Leo Chen" },
  { slug: "sam", name: "Sam Rivera" },
];
/** Groups show household, trip, simplified-debt, and separate-currency scenarios. */
const DEMO_GROUPS = [
  { slug: "home", name: "[Demo] Shared apartment", type: "home", currency: "USD", people: ["owner", "avery", "nila"] },
  { slug: "weekend", name: "[Demo] Catskills weekend", type: "trip", currency: "USD", people: ["owner", "avery", "leo", "sam"] },
  { slug: "lisbon", name: "[Demo] Lisbon getaway", type: "trip", currency: "EUR", people: ["owner", "nila", "sam"] },
];
/** One expense fixture, with all monetary amounts expressed in integer cents. */
interface DemoExpense {
  slug: string;
  group: string;
  description: string;
  amount: number;
  payer: string;
  category: string;
  daysAgo: number;
  people?: string[];
  split?: string;
  values?: number[];
}
/** Realistic sample ledger spanning dates, categories, payers, and all five split types. */
const DEMO_EXPENSES: DemoExpense[] = [
  { slug: "rent", group: "home", description: "October rent", amount: 210000, payer: "owner", category: "housing", daysAgo: 4 },
  { slug: "groceries", group: "home", description: "Weekly grocery run", amount: 12647, payer: "nila", category: "groceries", daysAgo: 3 },
  { slug: "internet", group: "home", description: "Home internet", amount: 7999, payer: "avery", category: "utilities", daysAgo: 6 },
  { slug: "electricity", group: "home", description: "Electricity bill", amount: 11280, payer: "owner", category: "utilities", daysAgo: 9, split: "shares", values: [2, 1, 1] },
  { slug: "cabin", group: "weekend", description: "Weekend cabin", amount: 68000, payer: "owner", category: "travel", daysAgo: 15 },
  { slug: "road-snacks", group: "weekend", description: "Groceries and road snacks", amount: 8453, payer: "avery", category: "groceries", daysAgo: 14 },
  { slug: "fuel", group: "weekend", description: "Road trip fuel", amount: 6820, payer: "leo", category: "transport", daysAgo: 13, split: "percent", values: [3500, 2500, 2500, 1500] },
  { slug: "trail", group: "weekend", description: "Trail passes", amount: 4000, payer: "sam", category: "entertainment", daysAgo: 12 },
  { slug: "lisbon-stay", group: "lisbon", description: "Lisbon apartment stay", amount: 27900, payer: "owner", category: "travel", daysAgo: 28 },
  { slug: "pastries", group: "lisbon", description: "Coffee and pasteis de nata", amount: 2350, payer: "nila", category: "food", daysAgo: 27, split: "exact", values: [900, 700, 750] },
  { slug: "museum", group: "lisbon", description: "Museum tickets", amount: 5400, payer: "sam", category: "entertainment", daysAgo: 26 },
  { slug: "dinner", group: "lisbon", description: "Riverside dinner", amount: 9750, payer: "owner", category: "food", daysAgo: 25, split: "itemized" },
  { slug: "coffee", group: "", description: "Coffee catch-up with Avery", amount: 1850, payer: "owner", category: "food", daysAgo: 2, people: ["owner", "avery"], split: "exact", values: [850, 1000] },
  { slug: "concert", group: "", description: "Concert tickets with Leo", amount: 12000, payer: "leo", category: "entertainment", daysAgo: 1, people: ["owner", "leo"] },
  { slug: "train", group: "", description: "Train tickets with Sam", amount: 48000, payer: "sam", category: "transport", daysAgo: 1, people: ["owner", "sam"] },
];
/** Comments make expense discussions and activity visible in both clients. */
const DEMO_COMMENTS = [
  { expense: "groceries", author: "nila", body: "This includes pantry basics and cleaning supplies. Sample data." },
  { expense: "cabin", author: "avery", body: "The cabin deposit is included. Thanks for booking! Sample data." },
  { expense: "dinner", author: "sam", body: "Dessert was shared; tax and tip are split by each person's items. Sample data." },
];
/** A demo person and their authenticated API clients. */
interface DemoPerson {
  user: Pick<User, "id" | "name" | "defaultCurrency">;
  clients: ReturnType<typeof makeClients>;
}

/**
 * Builds the same bearer transport used by mobile, with a token kept only in memory.
 * @param token - Locally issued session token, or empty for signup.
 * @returns Typed clients for the four domains used by the seed command.
 */
function makeClients(token = "") {
  const transport = createConnectTransport({
    baseUrl: API_URL,
    interceptors: [(next) => (request) => {
      request.header.set(SESSION_TRANSPORT_HEADER, BEARER_TRANSPORT);
      if (token) request.header.set("Authorization", `Bearer ${token}`);
      return next(request);
    }],
  });
  return {
    auth: createClient(AuthService, transport),
    expense: createClient(ExpenseService, transport),
    group: createClient(GroupService, transport),
    social: createClient(SocialService, transport),
  };
}

/**
 * Formats a past calendar day without floating point money or locale-dependent dates.
 * @param daysAgo - Number of calendar days before today.
 * @returns YYYY-MM-DD date accepted by the expense API.
 */
function expenseDate(daysAgo: number): string {
  const today = new Date();
  today.setUTCDate(today.getUTCDate() - daysAgo);
  return today.toISOString().slice(0, 10);
}

/**
 * Seeds the specified local account; existing marked demo rows are reused on subsequent runs.
 * @returns Completes after every sample expense and group passes balance checks.
 */
async function main(): Promise<void> {
  const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const environmentPath = resolve(webDirectory, "../../.env");
  if (existsSync(environmentPath)) loadEnvFile(environmentPath);
  process.chdir(webDirectory);
  if (process.env.NODE_ENV === "production") throw new Error("Demo data is available only in local development.");
  const configuredDatabase = readSecret("DATABASE_URL");
  const databaseHost = configuredDatabase ? new URL(configuredDatabase).hostname : process.env.POSTGRES_HOST ?? "localhost";
  if (!LOCAL_DATABASE_HOSTS.has(databaseHost)) throw new Error("Refusing to seed a remote database.");
  const email = process.argv[2]?.trim();
  if (!email) throw new Error("Usage: pnpm db:seed your-local-account@example.com (start ./dev.sh first).");

  // Load environment-dependent server helpers only after the root .env and cwd are ready.
  const { findUserByEmail } = await import("../src/server/auth/repo/users.repo");
  const { createToken } = await import("../src/server/auth/usecase/auth.usecase");
  const { listSettlementsInvolvingUser } = await import("../src/server/expense/repo/settlements.repo");
  const ownerRow = await findUserByEmail(email);
  if (!ownerRow || (!ownerRow.password_hash && !ownerRow.google_sub)) throw new Error("Create a local account before seeding it.");
  const owner: DemoPerson = {
    user: { id: ownerRow.id, name: ownerRow.name, defaultCurrency: ownerRow.default_currency },
    clients: makeClients(createToken(ownerRow.id, ownerRow.token_version)),
  };
  await owner.clients.auth.getMe({}); // Confirms the API and this command use the same database/signing key.
  const people: Record<string, DemoPerson> = { owner };
  const existingFriends = await owner.clients.social.listFriends({});

  for (const fixture of DEMO_PEOPLE) {
    const demoEmail = `${fixture.slug}.${owner.user.id.slice(0, 8)}@demo.example.test`;
    let demoRow = await findUserByEmail(demoEmail);
    if (!demoRow) {
      await makeClients().auth.signUp({ email: demoEmail, name: fixture.name, password: randomBytes(24).toString("base64url") });
      demoRow = await findUserByEmail(demoEmail);
    }
    if (!demoRow) throw new Error(`Could not create ${fixture.name}.`);
    const person: DemoPerson = {
      user: { id: demoRow.id, name: demoRow.name, defaultCurrency: demoRow.default_currency },
      clients: makeClients(createToken(demoRow.id, demoRow.token_version)),
    };
    people[fixture.slug] = person;
    await person.clients.auth.completeOnboarding({});
    if (!existingFriends.friends.some((friend) => friend.user?.id === person.user.id)) {
      await owner.clients.social.addFriend({ userId: person.user.id });
      await person.clients.social.respondFriendRequest({ userId: owner.user.id, accept: true });
    }
  }

  const existingGroups = await owner.clients.group.listGroups({});
  const groupIds: Record<string, string> = {};
  for (const fixture of DEMO_GROUPS) {
    const existing = existingGroups.groups.find((summary) => summary.group?.name === fixture.name && summary.group.createdBy === owner.user.id)?.group;
    const group = existing ?? await owner.clients.group.createGroup({
      name: fixture.name, type: fixture.type, currency: fixture.currency,
      memberIds: fixture.people.filter((personKey) => personKey !== "owner").map((personKey) => people[personKey].user.id),
    });
    groupIds[fixture.slug] = group.id;
    if (fixture.slug === "weekend" && !group.simplifyDebts) {
      await owner.clients.group.setSimplifyDebts({ groupId: group.id, simplify: true });
    }
  }

  const existingExpenses = await owner.clients.expense.listExpenses({});
  const expenseIds: Record<string, string> = {};
  let createdExpenses = 0;
  for (const fixture of DEMO_EXPENSES) {
    const marker = `[haalkhata-demo:${owner.user.id}:${fixture.slug}]`;
    const existing = existingExpenses.expenses.find((expense) => expense.notes.includes(marker));
    const groupFixture = DEMO_GROUPS.find((group) => group.slug === fixture.group);
    const participantKeys = fixture.people ?? groupFixture!.people;
    const splitType = fixture.split ?? "equal";
    const dinnerItems = fixture.slug === "dinner" ? [
      { name: "Grilled fish", quantity: 1, totalCents: 3000, assignments: [{ userId: people.owner.user.id, weight: 1 }] },
      { name: "Vegetarian plate", quantity: 1, totalCents: 2400, assignments: [{ userId: people.nila.user.id, weight: 1 }] },
      { name: "Pasta", quantity: 1, totalCents: 2100, assignments: [{ userId: people.sam.user.id, weight: 1 }] },
      { name: "Shared dessert", quantity: 1, totalCents: 900, assignments: participantKeys.map((personKey) => ({ userId: people[personKey].user.id, weight: 1 })) },
    ] : [];
    const expense = existing ?? await people[fixture.payer].clients.expense.createExpense({
      operationId: randomUUID(), groupId: groupIds[fixture.group] ?? "", description: fixture.description,
      amountCents: fixture.amount, currency: groupFixture?.currency ?? "USD", category: fixture.category,
      expenseDate: expenseDate(fixture.daysAgo), splitType, notes: `Fictional local demo data. ${marker}`,
      payers: [{ userId: people[fixture.payer].user.id, amountCents: fixture.amount }],
      splitSpecs: participantKeys.map((personKey, index) => ({
        userId: people[personKey].user.id,
        ...(splitType === "exact" ? { amountCents: fixture.values![index] } : {}),
        ...(splitType === "percent" ? { percentBp: fixture.values![index] } : {}),
        ...(splitType === "shares" ? { shares: fixture.values![index] } : {}),
      })),
      items: dinnerItems, taxCents: dinnerItems.length ? 750 : 0, tipCents: dinnerItems.length ? 600 : 0,
    });
    if (!existing) createdExpenses += 1;
    expenseIds[fixture.slug] = expense.id;
    if (expense.payers.reduce((total, payer) => total + payer.amountCents, 0) !== expense.amountCents
      || expense.splits.reduce((total, split) => total + split.owedCents, 0) !== expense.amountCents) {
      throw new Error(`Expense ${fixture.description} does not balance.`);
    }
  }

  for (const fixture of DEMO_COMMENTS) {
    const expenseId = expenseIds[fixture.expense];
    const detail = await owner.clients.expense.getExpense({ expenseId });
    if (!detail.comments.some((comment) => comment.body === fixture.body)) {
      await people[fixture.author].clients.expense.addComment({ expenseId, body: fixture.body });
    }
  }

  const existingSettlements = await listSettlementsInvolvingUser(owner.user.id);
  for (const fixture of [
    { slug: "avery-rent-payment", groupId: groupIds.home, person: "avery", amount: 5000, received: true },
    { slug: "leo-ticket-payment", groupId: "", person: "leo", amount: 2000, received: false },
  ]) {
    const marker = `[haalkhata-demo:${owner.user.id}:${fixture.slug}]`;
    if (!existingSettlements.some((settlement) => settlement.note.includes(marker))) {
      await owner.clients.expense.recordSettlement({
        operationId: randomUUID(), groupId: fixture.groupId, toUserId: people[fixture.person].user.id,
        amountCents: fixture.amount, currency: "USD", received: fixture.received, method: "cash",
        scopeGroupIds: fixture.groupId ? [] : [""], note: `Fictional sample payment. ${marker}`,
      });
    }
  }

  for (const groupId of Object.values(groupIds)) {
    const balances = await owner.clients.expense.getGroupBalances({ groupId });
    if (balances.nets.reduce((total, member) => total + member.netCents, 0) !== 0) {
      throw new Error(`Group ${groupId} does not balance.`);
    }
  }
  const overall = await owner.clients.expense.getOverallBalances({});
  console.log(JSON.stringify({
    account: owner.user.name, friends: DEMO_PEOPLE.length, groups: DEMO_GROUPS.length,
    demoExpenses: DEMO_EXPENSES.length, newlyCreatedExpenses: createdExpenses,
    demoSettlements: 2, comments: DEMO_COMMENTS.length, totals: overall.totals,
  }, null, 2));
}

// All requests have finished before exit; the repository's read-only pool otherwise stays idle for 30s.
main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seeding failed.");
  process.exit(1);
});
