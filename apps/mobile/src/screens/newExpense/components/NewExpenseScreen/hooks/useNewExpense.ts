/** Composite expense-form hook: field state, receipt scanning, payer/split validation, submit. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { draftItemsFromLines, itemsPayload } from "@/lib/expense/itemDraft";
import { useItemDraft } from "@/lib/hooks/useItemDraft";
import { PICKER_OPTIONS } from "../../../constants/imagePicker";
import type { ExpenseFormInitial } from "../../../utils/initialValues";
import {
  buildSplitSpecs,
  checkPayers,
  checkSplit,
  type FormSplitType,
} from "../../../utils/splitForm";
import type { ReceiptPhotoInput, useNewExpenseAPI } from "./useNewExpenseAPI";

/** A photo picked for scanning, plus its local URI for the preview. */
export interface ReceiptPhoto extends ReceiptPhotoInput {
  /** Local file URI used to render the preview image. */
  uri: string;
}

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
 *   validation results, `canSubmit`, the `submit` action, save state, and
 *   the receipt scanning state (`photo`, `pickPhoto`, `parseNow`,
 *   `isParsing`, `provider`, `fromReceipt`).
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
  const [error, setError] = useState("");
  // Receipt state. A scan is a way of filling this form in, not a separate
  // flow: the photo is parsed into the same item draft the Items split edits.
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [provider, setProvider] = useState("");
  // The itemized split's lines — the same editor whether they were typed or
  // read off a receipt.
  const itemDraft = useItemDraft({ items: initial.items, tax: initial.tax, tip: initial.tip });
  const isItemized = splitType === "itemized";

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
   * Drops one person from every per-user map, so a removed participant cannot
   * reach the request through `payerAmounts` or a stale split input.
   *
   * @param userId - Id of the person leaving the expense.
   */
  const forgetPerson = (userId: string) => {
    setCheckedOverride((current) => (current ? omitKey(current, userId) : current));
    setSplitInputs((current) => omitKey(current, userId));
    setPayerAmounts((current) => omitKey(current, userId));
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
      itemDraft.dropAssignee(userId);
      return;
    }
    setFriendIds([...friendIds, userId]);
    // Someone added to the expense shares it by default. Only needed once the
    // user has touched a participation checkbox — until then `checked` is
    // derived from `people` and already has them in.
    setCheckedOverride((current) => (current ? { ...current, [userId]: true } : current));
    itemDraft.assignAllTo(userId);
  };

  /**
   * Selects a group (or "" for a one-off). A group supplies the whole cast —
   * the server rejects a group expense with a non-member on it — so the
   * hand-picked people and every per-person value referring to them are
   * dropped.
   *
   * Item rows survive and are re-shared across the incoming roster rather
   * than left unassigned: attaching a scanned receipt to a group should not
   * mean re-ticking every line by hand.
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
    itemDraft.shareEveryItemWith(nextRoster);
  };

  /**
   * Captures or picks a receipt photo and forgets any previous parse — the
   * items stay as they are until "Itemize with AI" replaces them.
   *
   * @param useCamera - True to open the camera, false for the photo library.
   */
  const pickPhoto = async (useCamera: boolean) => {
    setError("");
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("camera permission is required to scan receipts");
        return;
      }
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setError("could not read the photo — try again");
      return;
    }
    setPhoto({
      uri: asset.uri,
      base64: asset.base64,
      // Always JPEG: PICKER_OPTIONS sets `quality`, which makes the picker
      // re-encode. Passing through asset.mimeType would label an iPhone photo
      // "image/heic" while the bytes are already JPEG, and the server's
      // magic-byte check would reject its own successfully converted image.
      mediaType: "image/jpeg",
    });
    setProvider("");
  };

  /**
   * Sends the chosen photo to the AI parser and loads the result into the
   * form: description and date (only where nothing was typed yet), tax, tip,
   * and the line items — shared by everyone on the expense, since splitting
   * the whole bill evenly is the common case — with the split switched to
   * Items.
   */
  const parseNow = () => {
    if (!photo) return;
    setError("");
    expenseAPI.parse.mutate(photo, {
      onSuccess: (result) => {
        const receipt = result.receipt;
        if (!receipt) return;
        setProvider(result.provider);
        // Only fill fields the user has not already written in — a scan
        // should not overwrite what somebody deliberately typed first.
        if (receipt.merchant) setDescription((current) => current || receipt.merchant);
        if (receipt.date) setDate(receipt.date);
        const everyone = Object.fromEntries(people.map((person) => [person.id, true]));
        itemDraft.replace(
          draftItemsFromLines(receipt.items).map((item) => ({
            ...item,
            assignees: { ...everyone },
          })),
          centsToInput(receipt.taxCents),
          centsToInput(receipt.tipCents),
        );
        setSplitType("itemized");
      },
      onError: (mutationError) => setError(errorMessage(mutationError)),
    });
  };

  // null override = default: everyone checked.
  const checked =
    checkedOverride ?? Object.fromEntries(people.map((person) => [person.id, true]));
  const setChecked = (next: Record<string, boolean>) => setCheckedOverride(next);

  // An itemized total is what the lines add up to; the amount field becomes
  // a readout of it rather than an input.
  const totalCents = isItemized ? itemDraft.grandTotalCents : parseMoneyInput(amount);
  const participantIds = people
    .filter((person) => checked[person.id])
    .map((person) => person.id);

  const splitCheck = isItemized
    ? itemDraft.completeness
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
      items: isItemized ? itemsPayload(itemDraft.items ?? []) : [],
      taxCents: isItemized ? itemDraft.taxCents : 0,
      tipCents: isItemized ? itemDraft.tipCents : 0,
    };

    const onSuccess = () => router.replace(groupId ? `/groups/${groupId}` : "/friends");
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
    setSplitType,
    isItemized,
    itemDraft,
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
    // Receipt scanning.
    photo,
    pickPhoto,
    parseNow,
    isParsing: expenseAPI.parse.isPending,
    provider,
    /** True once a receipt has been read into the form. */
    fromReceipt: provider !== "",
  };
}

/** The controller object returned by {@link useNewExpense}, consumed by the form editors. */
export type NewExpenseController = ReturnType<typeof useNewExpense>;
