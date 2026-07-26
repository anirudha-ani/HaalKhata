"use client";
/** Composite expense-form hook: field state, payer/split validation, submit. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage } from "@/lib/api/connect";
import { parseMoneyInput } from "@haalkhata/shared/money/money";
import {
  buildItemsPayload,
  buildSplitSpecs,
  checkItemized,
  checkPayers,
  checkSplit,
  itemizedTotals,
  previewItemizedShares,
  type DraftLineItem,
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
  const [items, setItems] = useState<DraftLineItem[]>(initial.items);
  const [taxInput, setTaxInput] = useState(initial.taxInput);
  const [tipInput, setTipInput] = useState(initial.tipInput);
  const [unevenShares, setUnevenShares] = useState(false);
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

  // Changing the context resets participant selection to "everyone". Item
  // rows survive, but their assignees refer to the old cast and are cleared.
  const changeContext = (next: string) => {
    setContext(next);
    setCheckedOverride(null);
    setSplitInputs({});
    setPayerAmounts({});
    setItems((current) => current.map((item) => ({ ...item, assignees: {} })));
  };

  // null override = default: everyone checked.
  const checked =
    checkedOverride ?? Object.fromEntries(people.map((person) => [person.id, true]));
  const setChecked = (next: Record<string, boolean>) => setCheckedOverride(next);

  const isItemized = splitType === "itemized";

  /**
   * Switches split mode, seeding the itemized draft with one blank row so the
   * editor never opens empty.
   *
   * @param next - The split type to switch to.
   */
  const changeSplitType = (next: FormSplitType) => {
    setSplitType(next);
    if (next === "itemized" && items.length === 0) addItem();
  };

  /**
   * Appends a blank line item, pre-shared equally by everyone in the context.
   * Splitting a new item across the whole table is by far the common case, so
   * the default costs zero taps and the user only touches the exceptions.
   */
  const addItem = () =>
    setItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        name: "",
        total: "",
        assignees: Object.fromEntries(people.map((person) => [person.id, 1])),
      },
    ]);

  /** Removes the line item at `index` from the itemized draft. */
  const removeItem = (index: number) =>
    setItems((current) => current.filter((_item, itemIndex) => itemIndex !== index));

  /**
   * Patches one field of the line item at `index`.
   *
   * @param index - Position of the item in the draft.
   * @param patch - Partial item fields to merge over the existing row.
   */
  const updateItem = (index: number, patch: Partial<DraftLineItem>) =>
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );

  /**
   * Sets a person's share weight on one item. A weight of 0 (or less) takes
   * them off the item entirely rather than storing a zero.
   *
   * @param index - Position of the item in the draft.
   * @param userId - Id of the person whose weight is changing.
   * @param weight - The new share weight; 0 or less removes the assignment.
   */
  const setAssigneeWeight = (index: number, userId: string, weight: number) =>
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const assignees = { ...item.assignees };
        if (weight > 0) assignees[userId] = weight;
        else delete assignees[userId];
        return { ...item, assignees };
      }),
    );

  const taxCents = parseMoneyInput(taxInput) ?? 0;
  const tipCents = parseMoneyInput(tipInput) ?? 0;
  const itemized = itemizedTotals(items, taxCents, tipCents);
  // Live "what each person owes" figures, from the same allocator the server
  // runs — so the preview under the grid is exactly what gets saved.
  const previewShares = previewItemizedShares(items, taxCents, tipCents);

  /**
   * Sets the tip to a percentage of the items subtotal (before tax), the way
   * tip is normally reckoned on a restaurant bill.
   *
   * @param percent - Tip percentage to apply, e.g. 18.
   */
  const applyTipPercent = (percent: number) =>
    setTipInput(((itemized.itemsTotalCents * percent) / 100 / 100).toFixed(2));

  // In itemized mode the total is derived from the line items; the amount
  // input is read-only and the server recomputes (and re-verifies) the same sum.
  const totalCents = isItemized ? itemized.totalCents : parseMoneyInput(amount);
  const participantIds = people
    .filter((person) => checked[person.id])
    .map((person) => person.id);

  const splitCheck = isItemized
    ? checkItemized(items)
    : checkSplit({ splitType, totalCents, participantIds, inputs: splitInputs });
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
      items: isItemized ? buildItemsPayload(items) : [],
      taxCents: isItemized ? taxCents : 0,
      tipCents: isItemized ? tipCents : 0,
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
    setSplitType: changeSplitType,
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
    isItemized,
    items,
    addItem,
    removeItem,
    updateItem,
    setAssigneeWeight,
    unevenShares,
    setUnevenShares,
    taxInput,
    setTaxInput,
    tipInput,
    setTipInput,
    applyTipPercent,
    previewShares,
    itemsTotalCents: itemized.itemsTotalCents,
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
