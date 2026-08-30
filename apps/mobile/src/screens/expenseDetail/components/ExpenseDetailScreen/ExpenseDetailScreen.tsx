/** Expense detail screen: payers, splits, receipt items, comments, and delete flow. */

import { useRouter } from "expo-router";
import { Lock, Pencil, Send, Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { formatMoney } from "@haalkhata/shared/money/money";
import { localDateTime } from "@haalkhata/shared/time/localTime";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { useExpenseDetail } from "./hooks/useExpenseDetail";
import { MAX_COMMENT_LENGTH } from "@haalkhata/shared/text/limits";

/**
 * Renders a single expense: header (description, date, category, amount),
 * edit/delete actions, payer and split breakdowns, receipt items when
 * itemized, notes, the comment thread with a composer, and a delete
 * confirmation sheet.
 *
 * @param props - Component props.
 * @param props.expenseId - Id of the expense to load and display.
 * @returns The expense detail screen content.
 */
export function ExpenseDetailScreen({ expenseId }: { expenseId: string }) {
  const expenseDetail = useExpenseDetail(expenseId);
  const router = useRouter();

  if (expenseDetail.isLoading) {
    return (
      <Screen header={<DetailHeader title="Expense" />}>
        <Spinner label="Loading expense…" />
      </Screen>
    );
  }
  const expense = expenseDetail.detail?.expense;
  if (!expense) {
    return (
      <Screen header={<DetailHeader title="Expense" />}>
        <View style={styles.notFoundCard}>
          <Text style={styles.notFoundText}>
            {expenseDetail.detailError
              ? errorMessage(expenseDetail.detailError)
              : "Expense not found."}
          </Text>
        </View>
      </Screen>
    );
  }

  /** Display name for a user id: "You" for the viewer, the user's name otherwise. */
  const displayName = (userId: string) =>
    userId === expenseDetail.me?.id
      ? "You"
      : (expenseDetail.userById.get(userId)?.name ?? "someone");

  // Anyone on the expense may correct it — creator, payer or ower — because
  // each can see the mistake and each is affected by it. Deletion stays with
  // the creator. Neither is refused once a payment has been recorded in the
  // ledger after the expense: the derived balance rebalances against what
  // was paid, so the screen warns rather than hides. A deleted expense is
  // frozen history — no actions, though comments stay open — with the row
  // kept so any payment made against it still has its explanation.
  const meId = expenseDetail.me?.id;
  const isCreator = expense.createdBy === meId;
  const isParticipant =
    isCreator ||
    expense.payers.some((payer) => payer.userId === meId) ||
    expense.splits.some((split) => split.userId === meId);
  const hasLaterSettlement = expenseDetail.detail?.hasLaterSettlement === true;
  const isDeleted = expense.deletedAt !== "";
  const deletion = expenseDetail.deletion;
  // Itemized expenses have no mobile editor yet; the web form handles them.
  const canEditHere = expense.splitType !== "itemized";

  return (
    <Screen header={<DetailHeader title="Expense" />}>
      <View style={styles.titleBlock}>
        <View style={styles.titleText}>
          <Text style={[styles.title, isDeleted ? styles.titleDeleted : null]}>
            {expense.description}
          </Text>
          <Text style={styles.meta}>
            {expense.expenseDate} · <Text style={styles.metaCapitalized}>{expense.category}</Text>
            {expense.groupId ? "" : " · one-off"}
          </Text>
          {expense.groupId ? (
            <Pressable onPress={() => router.push(`/groups/${expense.groupId}`)}>
              <Text style={styles.groupLink}>view group</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.amount}>{formatMoney(expense.amountCents, expense.currency)}</Text>
      </View>

      {isDeleted ? (
        <View style={styles.deletedCard}>
          <Trash2 color={colors.inkSoft} size={16} />
          <Text style={styles.deletedText}>
            Deleted
            {deletion?.actor
              ? ` by ${deletion.actor.id === meId ? "you" : deletion.actor.name}`
              : ""}{" "}
            {localDateTime(deletion?.createdAt || expense.deletedAt)}. It no longer counts toward
            anyone&apos;s balance; any payment made against it stays on the ledger.
          </Text>
        </View>
      ) : null}

      {isParticipant && !isDeleted && (canEditHere || isCreator) ? (
        <View style={styles.actions}>
          {canEditHere ? (
            <Button
              compact
              icon={<Pencil color={colors.inkSoft} size={14} />}
              label="Edit"
              onPress={() => router.push(`/expenses/new?edit=${expense.id}`)}
              variant="outline"
            />
          ) : null}
          {isCreator ? (
            <Button
              compact
              icon={<Trash2 color={colors.inkSoft} size={14} />}
              label="Delete"
              onPress={() => expenseDetail.setConfirmingDelete(true)}
              variant="outline"
            />
          ) : null}
        </View>
      ) : null}

      {isParticipant && !isDeleted && hasLaterSettlement ? (
        <View style={styles.settlementNoteCard}>
          <Lock color={colors.inkSoft} size={16} />
          <Text style={styles.settlementNoteText}>
            Somebody has paid against this ledger since this expense was added. Editing or
            deleting it rebalances what they owe — or are owed — against what has already been
            paid.
          </Text>
        </View>
      ) : null}

      <View style={styles.breakdownCard}>
        <Text style={styles.cardTitle}>PAID BY</Text>
        {expense.payers.map((payer) => {
          const payerUser = expenseDetail.userById.get(payer.userId);
          return (
            <View key={payer.userId} style={styles.personRow}>
              {payerUser ? <Avatar size="sm" user={payerUser} /> : null}
              <Text numberOfLines={1} style={styles.personName}>
                {displayName(payer.userId)}
              </Text>
              <Money cents={payer.amountCents} currency={expense.currency} style={styles.rowAmount} />
            </View>
          );
        })}
      </View>

      <View style={styles.breakdownCard}>
        <Text style={styles.cardTitle}>SPLIT · {expense.splitType.toUpperCase()}</Text>
        {expense.splits.map((split) => {
          const splitUser = expenseDetail.userById.get(split.userId);
          return (
            <View key={split.userId} style={styles.personRow}>
              {splitUser ? <Avatar size="sm" user={splitUser} /> : null}
              <Text numberOfLines={1} style={styles.personName}>
                {displayName(split.userId)}
              </Text>
              <Money cents={split.owedCents} currency={expense.currency} style={styles.rowAmount} />
            </View>
          );
        })}
      </View>

      {expense.items.length > 0 ? (
        <View style={styles.breakdownCard}>
          <Text style={styles.cardTitle}>RECEIPT ITEMS</Text>
          {expense.items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.itemRow, index > 0 ? styles.itemRowDivider : null]}
            >
              <Text numberOfLines={1} style={styles.itemName}>
                {item.quantity > 1 ? `${item.quantity}× ` : ""}
                {item.name}
              </Text>
              <View style={styles.itemAssignees}>
                {item.assignments.map((assignment, assignmentIndex) => {
                  const assignee = expenseDetail.userById.get(assignment.userId);
                  return assignee ? (
                    <View
                      key={assignment.userId}
                      style={assignmentIndex > 0 ? styles.assigneeOverlap : null}
                    >
                      <Avatar ring size="sm" user={assignee} />
                    </View>
                  ) : null;
                })}
              </View>
              <Money cents={item.totalCents} currency={expense.currency} style={styles.rowAmount} />
            </View>
          ))}
          {expense.taxCents > 0 || expense.tipCents > 0 ? (
            <Text style={styles.taxTip}>
              {expense.taxCents > 0
                ? `tax ${formatMoney(expense.taxCents, expense.currency)}`
                : ""}
              {expense.taxCents > 0 && expense.tipCents > 0 ? " · " : ""}
              {expense.tipCents > 0
                ? `tip ${formatMoney(expense.tipCents, expense.currency)}`
                : ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      {expense.notes ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesText}>{expense.notes}</Text>
        </View>
      ) : null}

      {/* Comments */}
      <View style={styles.commentsSection}>
        <Text style={styles.cardTitle}>COMMENTS</Text>
        {(expenseDetail.detail?.comments ?? []).map((comment) => (
          <View key={comment.id} style={styles.commentCard}>
            {comment.author ? <Avatar size="sm" user={comment.author} /> : null}
            <View style={styles.commentBody}>
              <Text style={styles.commentMeta}>
                <Text style={styles.commentAuthor}>{comment.author?.name}</Text> ·{" "}
                {localDateTime(comment.createdAt)}
              </Text>
              <Text style={styles.commentText}>{comment.body}</Text>
            </View>
          </View>
        ))}
        {/* Open on deleted expenses too: "why was this removed?" is exactly
            the conversation the kept row is there to host. */}
        <View style={styles.composer}>
          <TextInput
            maxLength={MAX_COMMENT_LENGTH}
            onChangeText={expenseDetail.setComment}
            placeholder="Add a comment…"
            placeholderTextColor={colors.inkSoft}
            style={styles.composerInput}
            value={expenseDetail.comment}
          />
          <Pressable
            accessibilityLabel="Send comment"
            disabled={expenseDetail.isCommenting || expenseDetail.comment.trim() === ""}
            onPress={() => expenseDetail.submitComment()}
            style={[
              styles.composerSend,
              expenseDetail.isCommenting || expenseDetail.comment.trim() === ""
                ? styles.composerSendDisabled
                : null,
            ]}
          >
            <Send color={colors.white} size={16} />
          </Pressable>
        </View>
      </View>

      {expenseDetail.error ? <Text style={styles.error}>{expenseDetail.error}</Text> : null}

      {expenseDetail.confirmingDelete ? (
        <Sheet onClose={() => expenseDetail.setConfirmingDelete(false)} title="Delete expense?">
          <View style={styles.deleteSheet}>
            <Text style={styles.deleteText}>
              “{expense.description}” ({formatMoney(expense.amountCents, expense.currency)}) will
              stop counting toward anyone&apos;s balance. It stays visible, marked deleted, and any
              payment already made against it stays on the ledger.
            </Text>
            <View style={styles.deleteActions}>
              <View style={styles.deleteAction}>
                <Button
                  label="Keep it"
                  onPress={() => expenseDetail.setConfirmingDelete(false)}
                  variant="outline"
                />
              </View>
              <View style={styles.deleteAction}>
                <Button
                  busy={expenseDetail.isRemoving}
                  label="Delete"
                  onPress={expenseDetail.remove}
                />
              </View>
            </View>
          </View>
        </Sheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  amount: {
    color: colors.ink,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  assigneeOverlap: {
    marginLeft: -8,
  },
  breakdownCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  commentAuthor: {
    color: colors.ink,
    fontWeight: "600",
  },
  commentBody: {
    flex: 1,
  },
  commentCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  commentMeta: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  commentsSection: {
    gap: spacing.sm,
  },
  commentText: {
    color: colors.ink,
    fontSize: 14,
    marginTop: 2,
  },
  composer: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  composerInput: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composerSend: {
    alignItems: "center",
    backgroundColor: colors.brand600,
    borderRadius: radii.md,
    justifyContent: "center",
    width: 44,
  },
  composerSendDisabled: {
    opacity: 0.4,
  },
  deleteAction: {
    flex: 1,
  },
  deleteActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  deletedCard: {
    alignItems: "flex-start",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  deletedText: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  deleteSheet: {
    gap: spacing.lg,
  },
  deleteText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
  },
  groupLink: {
    color: colors.brand600,
    fontSize: 13,
    fontWeight: "500",
    marginTop: spacing.xs,
  },
  itemAssignees: {
    flexDirection: "row",
  },
  itemName: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
  },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  itemRowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  meta: {
    color: colors.inkSoft,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  metaCapitalized: {
    textTransform: "capitalize",
  },
  notesCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  notesText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  notFoundCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  notFoundText: {
    color: colors.inkSoft,
    fontSize: 15,
  },
  personName: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
  },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "500",
  },
  settlementNoteCard: {
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  settlementNoteText: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  taxTip: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    color: colors.inkSoft,
    fontSize: 13,
    paddingTop: spacing.sm,
    textAlign: "right",
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "700",
  },
  titleBlock: {
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  titleDeleted: {
    color: colors.inkSoft,
    textDecorationLine: "line-through",
  },
  titleText: {
    flex: 1,
  },
});
