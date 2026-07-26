"use client";
/** Composite expense-form hook: field state, payer/split validation, submit. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage } from "@/lib/api/connect";
import { parseMoneyInput } from "@haalkhata/shared/money/money";
import {
  buildSplitSpecs,
  checkPayers,
  checkSplit,
  type FormSplitType,
} from "../../../utils/splitForm";
import type { ExpenseFormInitial } from "../../../utils/initialValues";
import type { useNewExpenseAPI } from "./useNewExpenseAPI";

/**
 * Expense form state. All fields initialize from `initial` (built once from
 * route params / the expense being edited) — no post-mount hydration effects.
 *
 * @param expenseAPI - Query/mutation bundle from {@link useNewExpenseAPI}.
 * @param initial - Fully-resolved initial values for every form field.
 * @param editExpenseId - Id of the expense being edited, or "" when creating.
 * @returns The form controller: every field value with its setter, the
 *   derived `people`/`participantIds`/`totalCents`, the payer and split
 *   validation results, `canSubmit`, the `submit` action, and save state.
 */
export function useNewExpense(
  expenseAPI: ReturnType<typeof useNewExpenseAPI>,
  initial: ExpenseFormInitial,
  editExpenseId: string,
) {
  const router = useRouter();

  const [context, setContext] = useState(initial.context);
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(initial.date);
  const [category, setCategory] = useState(initial.category);
  const [notes, setNotes] = useState(initial.notes);
  const [splitType, setSplitType] = useState<FormSplitType>(initial.splitType);
  const [checkedOverride, setCheckedOverride] = useState<Record<string, boolean> | null>(
    initial.checked,
  );
  const [splitInputs, setSplitInputs] = useState(initial.splitInputs);
  const [multiPayer, setMultiPayer] = useState(initial.multiPayer);
  const [singlePayerId, setSinglePayerId] = useState(initial.singlePayerId);
  const [payerAmounts, setPayerAmounts] = useState(initial.payerAmounts);
  const [error, setError] = useState("");

  const groupId = context.startsWith("g:") ? context.slice(2) : "";
  const friendId = context.startsWith("f:") ? context.slice(2) : "";
  const selectedGroup = expenseAPI.groups.find(
    (groupSummary) => groupSummary.group?.id === groupId,
  )?.group;

  /** Everyone who can participate in the current context. */
  const people: User[] = useMemo(() => {
    if (selectedGroup) {
      return selectedGroup.members.flatMap((member) => (member.user ? [member.user] : []));
    }
    if (friendId && expenseAPI.me) {
      const friend = expenseAPI.friends.find(
        (friendship) => friendship.user?.id === friendId,
      )?.user;
      return friend ? [expenseAPI.me, friend] : [expenseAPI.me];
    }
    return expenseAPI.me ? [expenseAPI.me] : [];
  }, [selectedGroup, friendId, expenseAPI.friends, expenseAPI.me]);

  // Changing the context resets participant selection to "everyone".
  const changeContext = (next: string) => {
    setContext(next);
    setCheckedOverride(null);
    setSplitInputs({});
    setPayerAmounts({});
  };

  // null override = default: everyone checked.
  const checked =
    checkedOverride ?? Object.fromEntries(people.map((person) => [person.id, true]));
  const setChecked = (next: Record<string, boolean>) => setCheckedOverride(next);

  const totalCents = parseMoneyInput(amount);
  const participantIds = people
    .filter((person) => checked[person.id])
    .map((person) => person.id);

  const splitCheck = checkSplit({ splitType, totalCents, participantIds, inputs: splitInputs });
  const payerCheck = checkPayers(totalCents, multiPayer, payerAmounts);
  const canSubmit =
    context !== "" &&
    description.trim() !== "" &&
    totalCents !== null &&
    totalCents > 0 &&
    splitCheck.ok &&
    payerCheck.ok;

  /** Builds the request from the current fields and fires create or update. */
  const submit = () => {
    if (!canSubmit || totalCents === null) return;
    setError("");
    const payers = multiPayer
      ? Object.entries(payerAmounts)
          .map(([userId, value]) => ({ userId, amountCents: parseMoneyInput(value) ?? 0 }))
          .filter((payer) => payer.amountCents > 0)
      : [{ userId: singlePayerId, amountCents: totalCents }];

    const request = {
      groupId,
      description: description.trim(),
      amountCents: totalCents,
      currency: selectedGroup?.currency ?? expenseAPI.me?.defaultCurrency ?? "USD",
      category,
      expenseDate: date,
      splitType,
      notes,
      payers,
      splitSpecs: buildSplitSpecs({ splitType, totalCents, participantIds, inputs: splitInputs }),
      items: [],
      taxCents: 0,
      tipCents: 0,
    };

    const onSuccess = () => router.push(groupId ? `/groups/${groupId}` : "/friends");
    const onError = (mutationError: unknown) => setError(errorMessage(mutationError));
    if (editExpenseId) {
      expenseAPI.update.mutate(
        { expenseId: editExpenseId, expense: request },
        { onSuccess, onError },
      );
    } else {
      expenseAPI.create.mutate(request, { onSuccess, onError });
    }
  };

  return {
    me: expenseAPI.me,
    groups: expenseAPI.groups,
    friends: expenseAPI.friends,
    isEdit: editExpenseId !== "",
    context,
    setContext: changeContext,
    description,
    setDescription,
    amount,
    setAmount,
    date,
    setDate,
    category,
    setCategory,
    notes,
    setNotes,
    splitType,
    setSplitType,
    people,
    checked,
    setChecked,
    splitInputs,
    setSplitInputs,
    multiPayer,
    setMultiPayer,
    singlePayerId,
    setSinglePayerId,
    payerAmounts,
    setPayerAmounts,
    selectedGroup,
    totalCents,
    participantIds,
    splitCheck,
    payerCheck,
    canSubmit,
    error,
    submit,
    isSaving: expenseAPI.create.isPending || expenseAPI.update.isPending,
  };
}

/** The controller object returned by {@link useNewExpense}, consumed by the form editors. */
export type NewExpenseController = ReturnType<typeof useNewExpense>;
