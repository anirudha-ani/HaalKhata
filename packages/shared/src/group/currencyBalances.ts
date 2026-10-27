/** A group's balances one currency at a time, as both apps read them off the server — pure. */

import type { CurrencyBucket } from "../money/balances";

/** One currency's balances in a group, as `GroupCurrencyBalances` carries them. */
export interface GroupCurrencySection<Net, Debt> {
  /** ISO 4217 code every amount in the section is in. */
  currency: string;
  /** Each person's net in that currency; > 0 means they get money back. */
  nets: readonly Net[];
  /** Who owes whom, person to person. */
  debts: readonly Debt[];
  /** The same balances combined into the fewest payments. */
  simplified: readonly Debt[];
}

/**
 * A group's balances, currency by currency, the group's own first.
 *
 * A group's money is in its own currency, but one can still hold a payment
 * recorded in another before group payments were kept to the group's own;
 * that is a second set of balances, never netted against the first. A
 * server from before `byCurrency` sends the group's own currency alone, at
 * the top level, which reads as that one set. So does a cached reply built
 * before the field existed, where it is undefined rather than empty.
 *
 * @param balances - The group-balances reply.
 * @param groupCurrency - The group's currency, for a reply with no `byCurrency`.
 * @returns One section per currency, the group's own first.
 */
export function groupBalanceSections<Net, Debt>(
  balances: {
    nets: readonly Net[];
    debts: readonly Debt[];
    simplified: readonly Debt[];
    byCurrency?: readonly GroupCurrencySection<Net, Debt>[];
  },
  groupCurrency: string,
): GroupCurrencySection<Net, Debt>[] {
  if (balances.byCurrency?.length) return [...balances.byCurrency];
  return [
    { currency: groupCurrency, nets: balances.nets, debts: balances.debts, simplified: balances.simplified },
  ];
}

/**
 * One person's balances in a group, per currency, from its sections.
 *
 * @param sections - The group's balances per currency.
 * @param userId - The person.
 * @returns Their non-zero nets, in the sections' order; > 0 means they are owed.
 */
export function memberBuckets(
  sections: readonly { currency: string; nets: readonly { userId: string; netCents: number }[] }[],
  userId: string,
): CurrencyBucket[] {
  return sections.flatMap((section) => {
    const cents = section.nets.find((position) => position.userId === userId)?.netCents ?? 0;
    return cents === 0 ? [] : [{ currency: section.currency, cents }];
  });
}

/** The fields of a listed group this reads; structurally the generated GroupSummary. */
export interface GroupSummaryBalances {
  /** The viewer's net in the group's own currency. */
  yourNetCents: number;
  /** The viewer's net per currency; undefined on a reply from before the field. */
  yourBalances?: readonly CurrencyBucket[];
  /** The group, for its currency. */
  group?: { currency: string };
}

/**
 * The viewer's balances in a listed group, per currency, the group's own
 * first. A reply from before `yourBalances` carries the group's own currency
 * alone, which reads as that one balance.
 *
 * @param summary - A group from the group list.
 * @returns The viewer's non-zero nets; > 0 means owed to them.
 */
export function yourGroupBuckets(summary: GroupSummaryBalances): CurrencyBucket[] {
  if (summary.yourBalances?.length) return summary.yourBalances.filter((bucket) => bucket.cents !== 0);
  return summary.yourNetCents === 0
    ? []
    : [{ currency: summary.group?.currency ?? "", cents: summary.yourNetCents }];
}

/**
 * Says which way the viewer's balances in a group point, for the line under
 * the group's name: "settled up", "owed to you", "you owe", or — for a group
 * holding two currencies pointing opposite ways — one phrase per amount, in
 * the amounts' order, so the first phrase belongs to the first amount shown.
 *
 * @param buckets - The viewer's non-zero nets in the group, in display order.
 * @returns The caption.
 */
export function groupPositionCaption(buckets: readonly CurrencyBucket[]): string {
  const outstanding = buckets.filter((bucket) => bucket.cents !== 0);
  if (outstanding.length === 0) return "settled up";
  if (outstanding.every((bucket) => bucket.cents > 0)) return "owed to you";
  if (outstanding.every((bucket) => bucket.cents < 0)) return "you owe";
  return outstanding.map((bucket) => (bucket.cents > 0 ? "owed to you" : "you owe")).join(" · ");
}

/** A debt that names one member, read from their side. */
export interface MemberDebt {
  /** ISO 4217 code of the debt. */
  currency: string;
  /** The other person on it. */
  counterpartId: string;
  /** Signed cents: > 0 means the other person owes the member. */
  cents: number;
}

/**
 * The debts in a group that still name one member, along the group's own
 * routing: person to person, or the simplified plan. The server refuses to
 * let them leave, or be removed, while any remain (audit B08) — a total of
 * zero can still be one person owed and another owing — so the clients say
 * so first. A person-to-person loop that cancels out is not debt (every net
 * is zero, and a payment along it is refused), so it holds nobody in.
 *
 * @param sections - The group's balances per currency.
 * @param userId - The member.
 * @param simplified - Whether the group simplifies debts.
 * @returns The debts naming them, from their side; empty when they can go.
 */
export function memberDebts<Debt extends { fromUserId: string; toUserId: string; amountCents: number }>(
  sections: readonly GroupCurrencySection<{ netCents: number }, Debt>[],
  userId: string,
  simplified: boolean,
): MemberDebt[] {
  return sections.flatMap((section) => {
    const debts = simplified ? section.simplified : section.debts;
    const cancelsOut = !simplified && section.nets.every((position) => position.netCents === 0);
    if (cancelsOut) return [];
    return debts.flatMap((debt) =>
      debt.fromUserId === userId
        ? [{ currency: section.currency, counterpartId: debt.toUserId, cents: -debt.amountCents }]
        : debt.toUserId === userId
          ? [{ currency: section.currency, counterpartId: debt.fromUserId, cents: debt.amountCents }]
          : [],
    );
  });
}

