"use client";
/** Group balances view: net positions plus pairwise/simplified debts with settle actions. */

import { ArrowRight, Wand2 } from "lucide-react";
import type { BalancesResponse } from "@haalkhata/protogen/expense/v1/expense_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { Money } from "@/components/ui/Money";
import { PersonLink } from "@/components/people/PersonLink";

/**
 * Renders the balances tab of a group: every member's net position, then the
 * list of who-owes-whom debts (pairwise or simplified) with a settle button on
 * the debts the viewer owes.
 *
 * @returns The two balance sections, or null until balances have loaded.
 */
export function BalancesPanel({
  balances,
  currency,
  meId,
  userById,
  simplified,
  simplifyPending = false,
  onToggleSimplified,
  onSettle,
}: {
  /** Balances response for the group; the panel renders nothing until it loads. */
  balances: BalancesResponse | undefined;
  /** Currency code all amounts are shown in (the group's currency). */
  currency: string;
  /** The signed-in user's id, used to label rows as "You" and show settle buttons. */
  meId: string | undefined;
  /** Lookup from user id to User for rendering names and avatars. */
  userById: Map<string, User>;
  /** The group's persisted simplify-debts mode; decides which debt list is live. */
  simplified: boolean;
  /** True while a toggle of the mode is in flight; disables the switch. */
  simplifyPending?: boolean;
  /** Called with the desired state when the simplify-debts toggle is pressed. */
  onToggleSimplified: (value: boolean) => void;
  /**
   * Called when the viewer taps the action on a debt, with the other party,
   * the amount, and whether this records money *received* rather than paid.
   */
  onSettle: (user: User, cents: number, received: boolean) => void;
}) {
  if (!balances) return null;
  const debts = simplified ? balances.simplified : balances.debts;
  // Pairwise debts that survive while every net is zero can only be a loop —
  // typically left behind by payments recorded while debts were simplified.
  // Money-wise nobody owes anybody; without a word of explanation the list
  // looks like outstanding debt, so it gets one.
  const cancelingLoop =
    !simplified &&
    debts.length > 0 &&
    balances.nets.every((position) => position.netCents === 0);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Net positions
        </h3>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {balances.nets.map((netPosition) => {
            const user = userById.get(netPosition.userId);
            if (!user) return null;
            return (
              <li key={netPosition.userId} className="flex items-center gap-3 px-4 py-3">
                <Avatar user={user} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {user.id === meId ? "You" : user.name}
                </span>
                {netPosition.netCents === 0 ? (
                  <span className="text-xs text-ink-soft">settled up</span>
                ) : (
                  <>
                    <span className="text-xs text-ink-soft">
                      {netPosition.netCents > 0 ? "gets back" : "owes"}
                    </span>
                    <Money
                      cents={netPosition.netCents}
                      currency={currency}
                      signed
                      className="font-semibold"
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        {/* The mode gets a real switch with its state written out, not an
            outlined chip that reads as "maybe on?". It decides which debts
            exist — here, on friend pages, on the dashboard — and which
            payments the server accepts, for everyone in the group, so its
            state has to be legible at a glance and said before it is
            flipped, not after. */}
        <div
          className={`mb-3 rounded-2xl border p-4 ${
            simplified ? "border-brand-200 bg-brand-50" : "border-line bg-card"
          }`}
        >
          <div className="flex items-center gap-3">
            <Wand2
              className={`h-5 w-5 shrink-0 ${simplified ? "text-brand-600" : "text-ink-soft"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Simplify debts{" "}
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase ${
                    simplified ? "bg-brand-600 text-white" : "bg-paper text-ink-soft"
                  }`}
                >
                  {simplified ? "On" : "Off"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {simplified
                  ? "Debts are combined into the fewest payments, so you may pay a different person than you shared an expense with. Applies to everyone in this group."
                  : "Debts run person to person, exactly as shared. Turning this on combines them into fewer payments — for everyone in this group."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={simplified}
              aria-label="Simplify debts"
              disabled={simplifyPending}
              onClick={() => onToggleSimplified(!simplified)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                simplified ? "bg-brand-600" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  simplified ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        </div>

        <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          {simplified ? "Simplified payments" : "Who owes whom"}
        </h3>

        {cancelingLoop ? (
          <p className="mb-2 rounded-xl border border-dashed border-line bg-card px-4 py-2.5 text-xs text-ink-soft">
            These debts cancel out around a loop — everyone&apos;s overall position is zero.
            Turn Simplify debts on above to clear the view.
          </p>
        ) : null}

        {debts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-6 text-center text-sm text-ink-soft">
            Everyone is settled up 🎉
          </p>
        ) : (
          <ul className="space-y-2">
            {debts.map((debt) => {
              const fromUser = userById.get(debt.fromUserId);
              const toUser = userById.get(debt.toUserId);
              if (!fromUser || !toUser) return null;
              const mine = debt.fromUserId === meId;
              const owedToMe = debt.toUserId === meId;
              return (
                <li
                  key={`${debt.fromUserId}-${debt.toUserId}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3"
                >
                  <PersonLink userId={debt.fromUserId} meId={meId}>
                    <Avatar user={fromUser} size="sm" />
                  </PersonLink>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
                  <PersonLink userId={debt.toUserId} meId={meId}>
                    <Avatar user={toUser} size="sm" />
                  </PersonLink>
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <PersonLink userId={debt.fromUserId} meId={meId} className="font-medium">
                      {mine ? "You" : fromUser.name}
                    </PersonLink>
                    <span className="text-ink-soft"> owe{mine ? "" : "s"} </span>
                    <PersonLink userId={debt.toUserId} meId={meId} className="font-medium">
                      {debt.toUserId === meId ? "you" : toUser.name}
                    </PersonLink>
                  </p>
                  <Money cents={debt.amountCents} currency={currency} className="font-semibold" />
                  {/* Both directions, matching the friend page: a debt you owe
                      is one to pay, a debt owed to you is one to record when it
                      lands. Only offering the first left a group where everyone
                      owes the payer with no action anywhere on the screen —
                      which is the ordinary case for whoever picked up the bill. */}
                  {/* A loop that nets to zero offers no action: the server
                      refuses to pay it down, and a button that only ever
                      produces a refusal is worse than none. */}
                  {(mine || owedToMe) && !cancelingLoop ? (
                    <button
                      type="button"
                      onClick={() => onSettle(mine ? toUser : fromUser, debt.amountCents, !mine)}
                      className="shrink-0 rounded-lg bg-pos-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pos-700"
                    >
                      {mine ? "Settle" : "Record"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
