"use client";
/** Composite expense-form hook: field state, payer/split validation, submit. */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage } from "@/lib/api/connect";
import { prepareReceiptImage } from "@/lib/image/receiptImage";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";
import {
  buildItemsPayload,
  buildSplitSpecs,
  checkItemized,
  checkPayers,
  checkSplit,
  includeInEveryItem,
  itemizedTotals,
  previewItemizedShares,
  shareEveryItemWith,
  type DraftLineItem,
  type FormSplitType,
} from "@/lib/expense/splitForm";
import type { ExpenseFormInitial } from "../../../utils/initialValues";
import type { useNewExpenseAPI } from "./useNewExpenseAPI";

/**
 * Returns a copy of `source` without `keyToDrop`.
 *
 * @param source - The record to copy.
 * @param keyToDrop - Key to leave out of the copy.
 * @returns A new record with every other entry of `source`.
 */
function omitKey<Value>(source: Record<string, Value>, keyToDrop: string): Record<string, Value> {
  const { [keyToDrop]: _dropped, ...rest } = source;
  return rest;
}

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

  const [groupId, setGroupId] = useState(initial.groupId);
  const [friendIds, setFriendIds] = useState(initial.friendIds);
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

  // Receipt state. A scan is a way of filling this form in, not a separate
  // kind of expense, so it lives on the same controller as everything else.
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);

  const selectedGroup = expenseAPI.groups.find(
    (groupSummary) => groupSummary.group?.id === groupId,
  )?.group;

  /**
   * Every user this form can name, so an ad-hoc participant still resolves
   * when they are not in the friends list — group rosters and the edited
   * expense's own users are equally valid sources.
   */
  const usersById = useMemo(() => {
    const directory = new Map<string, User>();
    for (const groupSummary of expenseAPI.groups) {
      for (const member of groupSummary.group?.members ?? []) {
        if (member.user) directory.set(member.user.id, member.user);
      }
    }
    for (const person of expenseAPI.editing?.users ?? []) directory.set(person.id, person);
    for (const friendship of expenseAPI.friends) {
      if (friendship.user) directory.set(friendship.user.id, friendship.user);
    }
    return directory;
  }, [expenseAPI.groups, expenseAPI.friends, expenseAPI.editing]);

  /**
   * Everyone on this expense, you first: a group's whole roster when a group
   * is selected, otherwise you plus the ad-hoc people picked by hand.
   */
  const people: User[] = useMemo(() => {
    const currentUser = expenseAPI.me;
    if (!currentUser) return [];
    const others = selectedGroup
      ? selectedGroup.members.flatMap((member) => (member.user ? [member.user] : []))
      : friendIds.flatMap((userId) => {
          const person = usersById.get(userId);
          return person ? [person] : [];
        });
    return [currentUser, ...others.filter((person) => person.id !== currentUser.id)];
  }, [selectedGroup, friendIds, usersById, expenseAPI.me]);

  /**
   * Drops one person from every per-user map. Without this a removed
   * participant would still be posted: `submit` sends `payerAmounts` as-is and
   * `buildItemsPayload` reads each item's `assignees` as-is.
   *
   * @param userId - Id of the person leaving the expense.
   */
  const forgetPerson = (userId: string) => {
    setCheckedOverride((current) => (current ? omitKey(current, userId) : current));
    setSplitInputs((current) => omitKey(current, userId));
    setPayerAmounts((current) => omitKey(current, userId));
    setItems((current) =>
      current.map((item) => ({ ...item, assignees: omitKey(item.assignees, userId) })),
    );
    setSinglePayerId((current) => (current === userId ? (expenseAPI.me?.id ?? "") : current));
  };

  /**
   * Adds or removes an ad-hoc participant.
   *
   * Somebody joining goes onto every existing line item, which is the same
   * "shared by everyone" default a new item gets, applied from the other
   * direction — you untick their exceptions. This matters most when a receipt
   * was scanned before the cast was picked, which is the natural order when
   * the paper is in your hand: without it every parsed line would stay
   * assigned to you alone and the newcomer would owe nothing.
   *
   * @param userId - Id of the person to toggle on this expense.
   */
  const toggleFriend = (userId: string) => {
    if (friendIds.includes(userId)) {
      setFriendIds(friendIds.filter((existingId) => existingId !== userId));
      forgetPerson(userId);
      return;
    }
    setFriendIds([...friendIds, userId]);
    // Someone added to the expense shares it by default. Only needed once the
    // user has touched a participation checkbox — until then `checked` is
    // derived from `people` and already has them in.
    setCheckedOverride((current) => (current ? { ...current, [userId]: true } : current));
    setItems((current) => includeInEveryItem(current, userId));
  };

  /**
   * Selects a group (or "" for a one-off). A group supplies the whole cast —
   * the server rejects a group expense with a non-member on it — so the
   * hand-picked people are dropped, along with every per-person value that
   * referred to the old cast.
   *
   * Item rows survive and are re-shared across the incoming roster rather than
   * left unassigned: attaching a scanned receipt to a group should not mean
   * re-ticking every line by hand.
   *
   * @param nextGroupId - Id of the group to attach the expense to, "" for none.
   */
  const changeGroup = (nextGroupId: string) => {
    const currentUserId = expenseAPI.me?.id ?? "";
    const nextRoster = nextGroupId
      ? (expenseAPI.groups
          .find((groupSummary) => groupSummary.group?.id === nextGroupId)
          ?.group?.members.flatMap((member) => (member.user ? [member.user.id] : [])) ?? [])
      : [currentUserId];
    setGroupId(nextGroupId);
    setFriendIds([]);
    setCheckedOverride(null);
    setSplitInputs({});
    setPayerAmounts({});
    setSinglePayerId(currentUserId);
    setItems((current) => shareEveryItemWith(current, nextRoster));
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
        key: nextDraftKey(),
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

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  useEffect(() => () => URL.revokeObjectURL(receiptUrl), [receiptUrl]);

  /**
   * Stores a newly chosen receipt photo and clears anything a previous scan
   * produced, so a second photo cannot leave the first one's items behind.
   *
   * The photo is shrunk to upload size first ({@link prepareReceiptImage}).
   * A phone shot is 3–12 MB, all of which would otherwise cross a mobile
   * connection for the server to discard — and over 8 MB is rejected outright
   * after the wait. `isPreparing` covers the decode, which is a visible pause
   * on a 12-megapixel image and would otherwise look like a dead tap.
   *
   * @param picked - The image file chosen or captured by the user.
   */
  const pickFile = async (picked: File) => {
    setProvider("");
    setError("");
    setReceiptUrl((previousUrl) => {
      URL.revokeObjectURL(previousUrl);
      return "";
    });
    setIsPreparing(true);
    try {
      const prepared = await prepareReceiptImage(picked);
      setFile(prepared);
      setPreviewUrl((previousUrl) => {
        URL.revokeObjectURL(previousUrl);
        return URL.createObjectURL(prepared);
      });
    } finally {
      setIsPreparing(false);
    }
  };

  /**
   * Whether the browser can actually paint this file in an `<img>`. HEIC is
   * accepted and transcoded server-side, but Chrome and Firefox cannot decode
   * it, so rendering the object URL would show a broken-image icon for a file
   * that is perfectly fine. Once parsed, `receiptUrl` (the server's JPEG)
   * takes over and this no longer matters.
   */
  const isPreviewRenderable =
    file !== null && !/^image\/hei[cf]$/i.test(file.type) && !/\.hei[cf]$/i.test(file.name);

  /**
   * Sends the chosen photo to the AI parser and pours the result into this
   * form: merchant becomes the description, and the extracted lines become
   * the itemized draft with the split switched to match.
   */
  const parseNow = () => {
    if (!file) return;
    setError("");
    expenseAPI.parse.mutate(file, {
      onSuccess: (result) => {
        const receipt = result.receipt;
        if (!receipt) return;
        setProvider(result.provider);
        // Only fill fields the user has not already written in — a scan
        // should not overwrite what somebody deliberately typed first.
        if (receipt.merchant) setDescription((current) => current || receipt.merchant);
        if (receipt.date) setDate(receipt.date);
        setTaxInput(centsToInput(receipt.taxCents));
        setTipInput(centsToInput(receipt.tipCents));
        // Parsed rows start shared by everyone: splitting the whole bill
        // evenly is the common case, so it costs zero taps and the user only
        // touches the exceptions.
        const everyone = Object.fromEntries(people.map((person) => [person.id, 1]));
        setItems(
          receipt.items.map((item) => ({
            key: nextDraftKey(),
            name: item.name,
            quantity: item.quantity,
            total: centsToInput(item.totalCents),
            assignees: { ...everyone },
          })),
        );
        setSplitType("itemized");
        // The server hands back the JPEG it actually showed the model — the
        // upload after rotation, downscaling and HEIC transcoding. Showing
        // that rather than the raw file is what makes an iPhone receipt
        // viewable at all, and it is the image the numbers came from.
        if (result.normalizedImage.length > 0) {
          const blob = new Blob([result.normalizedImage as BlobPart], { type: "image/jpeg" });
          setReceiptUrl((previousUrl) => {
            URL.revokeObjectURL(previousUrl);
            return URL.createObjectURL(blob);
          });
        }
      },
      onError: (mutationError) => setError(errorMessage(mutationError)),
    });
  };

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
  // A group, or at least one other person — mirrors exactly what the picker
  // shows, so the button never disables for a reason that isn't on screen.
  const hasParticipants = groupId !== "" || friendIds.length > 0;
  const canSubmit =
    hasParticipants &&
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
    groupId,
    setGroupId: changeGroup,
    friendIds,
    toggleFriend,
    hasParticipants,
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
    // Receipt scanning.
    file,
    fileName: file?.name ?? "",
    previewUrl,
    receiptUrl,
    isPreviewRenderable,
    pickFile,
    isPreparing,
    parseNow,
    isParsing: expenseAPI.parse.isPending,
    provider,
    // A quantity column is only worth its width when a bill was actually read
    // off paper; typed items have no quantity to show.
    fromReceipt: provider !== "",
  };
}

/** The controller object returned by {@link useNewExpense}, consumed by the form editors. */
export type NewExpenseController = ReturnType<typeof useNewExpense>;
