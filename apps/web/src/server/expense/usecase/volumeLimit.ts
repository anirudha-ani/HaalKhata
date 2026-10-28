/** The ceiling on how much the expenses one person is on may add up to, checked wherever an expense is written. */

import type { PoolClient } from "pg";
import { formatMoney } from "@haalkhata/shared/money/money";
import { findUsersByIds } from "@/server/auth/repo/users.repo";
import { UsecaseError } from "@/server/common/errors";
import { MAX_PERSON_VOLUME_CENTS, volumeLimitRefusal } from "@/server/expense/expense.constants";
import { sumExpenseVolumes } from "@/server/expense/repo/ledger.repo";

/** The money side of an expense: its currency, its total and who is on it. */
export interface ExpenseVolume {
  /** Currency of the expense. */
  currency: string;
  /** Its total, in that currency's minor units. */
  amountCents: number;
  /** Everyone who pays or owes a share of it. */
  participantIds: readonly string[];
}

/**
 * Refuses an expense that would take anyone on it past
 * {@link MAX_PERSON_VOLUME_CENTS} in its currency, so that no balance,
 * debt or total the apps show for them can grow past what a JavaScript
 * number holds exactly. Called inside the write's transaction, after its
 * ledger locks, by creating and by editing an expense.
 *
 * An edit that does not raise someone's total is never refused for them,
 * so an expense can always be corrected downwards.
 *
 * @param written - The expense about to be stored.
 * @param callerId - Who is saving it, so their own refusal speaks to them.
 * @param client - The write's transaction.
 * @param replacing - The stored expense an edit replaces, with its id.
 * @throws UsecaseError (failed_precondition) naming the first person it would take past the ceiling.
 */
export async function assertRoomInLedgers(
  written: ExpenseVolume,
  callerId: string,
  client: PoolClient,
  replacing?: ExpenseVolume & { id: string },
): Promise<void> {
  const others = await sumExpenseVolumes(written.participantIds, written.currency, replacing?.id ?? null, client);
  // Who the replaced version already counted against, in this currency.
  const counted = new Set(replacing?.currency === written.currency ? replacing.participantIds : []);
  const replacedCents = replacing?.amountCents ?? 0;
  const over = written.participantIds.find((personId) => {
    const after = (others.get(personId) ?? 0) + written.amountCents;
    const before = (others.get(personId) ?? 0) + (counted.has(personId) ? replacedCents : 0);
    return after > MAX_PERSON_VOLUME_CENTS && after > before;
  });
  if (over === undefined) return;
  const ceiling = formatMoney(MAX_PERSON_VOLUME_CENTS, written.currency);
  const name = over === callerId ? undefined : (await findUsersByIds([over], client))[0]?.name ?? "someone on it";
  throw new UsecaseError("failed_precondition", volumeLimitRefusal(ceiling, name));
}
