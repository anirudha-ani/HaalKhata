/** Composite expense-form hook: field state, receipt scanning, payer/split validation, submit. */

import { receiptCurrencyError } from "@haalkhata/shared/expense/form/receiptCurrency";
import { expenseFormCurrency } from "@haalkhata/shared/expense/form/formCurrency";
import { useReceiptScanConsent } from "@/lib/receipt/hooks/useReceiptScanConsent";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { newOperationId } from "@/lib/api/operationId";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import {
  initialExpensePeopleIds,
  resolveExpensePeople,
  toggleExpensePerson,
} from "@haalkhata/shared/expense/participants";
import { draftItemsFromLines } from "@/lib/expense/itemDraft";
import { buildItemsPayload as itemsPayload } from "@haalkhata/shared/expense/form/splitForm";
import { useItemDraft } from "@/lib/hooks/useItemDraft";
import { prepareReceiptPhoto } from "../../../utils/prepareReceiptPhoto";
import { PICKER_OPTIONS } from "../../../constants/imagePicker";
import type { ExpenseFormInitial } from "../../../utils/initialValues";
import {
  buildSplitSpecs,
  checkPayers,
  checkSplit,
  type FormSplitType,
} from "@haalkhata/shared/expense/form/splitForm";
import type { ReceiptPhotoInput, useNewExpenseAPI } from "./useNewExpenseAPI";

/** A photo picked for scanning, plus its local URI for the preview. */
export interface ReceiptPhoto extends ReceiptPhotoInput {
  /** Local file URI used to render the preview image. */
  uri: string;
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
  const [personIds, setPersonIds] = useState<string[] | null>(() =>
    initial.groupId
      ? initialExpensePeopleIds(initial.checked, initial.singlePayerId, initial.payerAmounts)
      : initial.friendIds,
  );
  const friendIds = groupId
    ? []
    : (personIds ?? []).filter((userId) => userId !== expenseAPI.me?.id);
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
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [provider, setProvider] = useState("");
  // One id per attempt at saving: a retry after a lost response sends the
  // same one and gets the expense the first attempt stored, not a second.
  const operationIdRef = useRef(newOperationId());
  const isItemized = splitType === "itemized";

  const selectedGroup = expenseAPI.groups.find(
    (groupSummary) => groupSummary.group?.id === groupId,
  )?.group;
  // Inputs, previews and the saved request must share the original currency
  // when editing; changing a profile default is never a currency conversion.
  const currency = expenseFormCurrency(selectedGroup?.currency, expenseAPI.editing?.expense?.currency, expenseAPI.me?.defaultCurrency);
  // The itemized split's lines — the same editor whether they were typed or
  // read off a receipt.
  const itemDraft = useItemDraft(
    { items: initial.items, tax: initial.tax, tip: initial.tip },
    currency,
  );

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

  /** Selected people, you first; a new group expense starts with its whole roster. */
  const people: User[] = useMemo(() => {
    const currentUser = expenseAPI.me;
    if (!currentUser) return [];
    const candidates = selectedGroup
      ? selectedGroup.members.flatMap((member) => (member.user && !member.user.deleted ? [member.user] : []))
      : (personIds ?? []).flatMap((userId) => {
          const person = usersById.get(userId);
          return person ? [person] : [];
        });
    return resolveExpensePeople(currentUser, candidates, selectedGroup ? personIds : null);
  }, [selectedGroup, personIds, usersById, expenseAPI.me]);

  // A receipt may finish after the people or group changed. Its callback must
  // use the current selection and currency rather than those at scan start.
  const receiptContextRef = useRef({ people, currency });
  useEffect(() => {
    receiptContextRef.current = { people, currency };
  }, [people, currency]);

  /**
   * Adds or removes a person from this expense, including group members.
   * Removing clears their payer, split, and item values; adding shares every
   * existing item by default, including receipts scanned before selecting people.
   * @param userId - Id of the person to toggle on this expense.
   */
  const togglePerson = (userId: string) => {
    const currentUserId = expenseAPI.me?.id ?? "";
    if (userId === currentUserId) return;
    const peopleIds = people.map((person) => person.id);
    const wasIncluded = peopleIds.includes(userId);
    const next = toggleExpensePerson(
      { personIds, checked: checkedOverride, splitInputs, payerAmounts, singlePayerId },
      peopleIds,
      userId,
      currentUserId,
    );
    setPersonIds(next.personIds);
    setCheckedOverride(next.checked);
    setSplitInputs(next.splitInputs);
    setPayerAmounts(next.payerAmounts);
    setSinglePayerId(next.singlePayerId);
    if (wasIncluded) itemDraft.dropAssignee(userId);
    else itemDraft.assignAllTo(userId);
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
          ?.group?.members.flatMap((member) => (member.user && !member.user.deleted ? [member.user.id] : [])) ?? [])
      : [currentUserId];
    setGroupId(nextGroupId);
    setPersonIds(nextGroupId ? null : []);
    setCheckedOverride(null);
    setSplitInputs({});
    setPayerAmounts({});
    setSinglePayerId(currentUserId);
    itemDraft.shareEveryItemWith(nextRoster);
  };

  /**
   * Sends the chosen photo to the AI parser and loads the result into the
   * form: description and date (only where nothing was typed yet), tax, tip,
   * and the line items — shared by everyone on the expense, since splitting
   * the whole bill evenly is the common case — with the split switched to
   * Items.
   * @param consentVersion Current sharing terms authorized for this account.
   */
  const parsePhoto = (consentVersion: string) => {
    if (!photo) return;
    setError("");
    expenseAPI.parse.mutate({ ...photo, consentVersion }, {
      onSuccess: (result) => {
        const receipt = result.receipt;
        if (!receipt) return;
        const { people: receiptPeople, currency: receiptCurrency } = receiptContextRef.current;
        const currencyError = receiptCurrencyError(receipt.currency, receiptCurrency);
        if (currencyError) { setError(currencyError); return; }
        setProvider(result.provider);
        // Only fill fields the user has not already written in — a scan
        // should not overwrite what somebody deliberately typed first.
        if (receipt.merchant) setDescription((current) => current || receipt.merchant);
        if (receipt.date) setDate(receipt.date);
        const everyone = Object.fromEntries(receiptPeople.map((person) => [person.id, 1]));
        itemDraft.replace(
          draftItemsFromLines(receipt.items, receiptCurrency).map((item) => ({
            ...item,
            assignees: { ...everyone },
          })),
          centsToInput(receipt.taxCents, receiptCurrency),
          centsToInput(receipt.tipCents, receiptCurrency),
        );
        setSplitType("itemized");
      },
      onError: (mutationError) => setError(errorMessage(mutationError)),
    });
  };

  const receiptConsent = useReceiptScanConsent(parsePhoto);

  /**
   * Captures or picks a receipt photo and forgets any previous parse — the
   * items stay as they are until "Itemize with AI" replaces them.
   *
   * @param useCamera - True to open the camera, false for the photo library.
   */
  const pickPhoto = async (useCamera: boolean) => {
    if (isPickingPhoto || expenseAPI.parse.isPending || receiptConsent.busy || receiptConsent.prompt) return;
    setError(""); setIsPickingPhoto(true);
    try {
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError("Camera access is disabled. Enable it in Settings or choose an existing photo.");
          return;
        }
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error("Could not read the photo. Try again.");
      setPhoto(await prepareReceiptPhoto(asset));
      setProvider("");
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setIsPickingPhoto(false); }
  };

  // null override = default: everyone checked.
  const checked =
    checkedOverride ?? Object.fromEntries(people.map((person) => [person.id, true]));
  const setChecked = (next: Record<string, boolean>) => setCheckedOverride(next);

  // An itemized total is what the lines add up to; the amount field becomes
  // a readout of it rather than an input.
  const totalCents = isItemized ? itemDraft.grandTotalCents : parseMoneyInput(amount, currency);
  const participantIds = people
    .filter((person) => checked[person.id])
    .map((person) => person.id);

  const splitCheck = isItemized
    ? itemDraft.completeness
    : checkSplit({ splitType, totalCents, participantIds, inputs: splitInputs, currency });
  const payerCheck = checkPayers(totalCents, multiPayer, payerAmounts, currency);
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
          .map(([userId, value]) => ({ userId, amountCents: parseMoneyInput(value, currency) ?? 0 }))
          .filter((payer) => payer.amountCents > 0)
      : [{ userId: singlePayerId, amountCents: totalCents }];

    const request = {
      groupId,
      description: description.trim(),
      amountCents: totalCents,
      currency,
      category,
      expenseDate: date,
      splitType,
      notes,
      payers,
      splitSpecs: buildSplitSpecs({
        splitType,
        totalCents,
        participantIds,
        inputs: splitInputs,
        currency,
      }),
      items: isItemized ? itemsPayload(itemDraft.items ?? [], currency) : [],
      taxCents: isItemized ? itemDraft.taxCents : 0,
      tipCents: isItemized ? itemDraft.tipCents : 0,
      operationId: operationIdRef.current,
    };

    const onSuccess = () => {
      operationIdRef.current = newOperationId();
      router.replace(groupId ? `/groups/${groupId}` : "/friends");
    };
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
    splitNotice: splitType === "exact" ? initial.splitNotice : undefined,
    currency,
    me: expenseAPI.me,
    groups: expenseAPI.groups,
    friends: expenseAPI.friends,
    isEdit: editExpenseId !== "",
    groupId,
    setGroupId: changeGroup,
    friendIds,
    togglePerson,
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
    receiptConsent,
    isReceiptBusy: expenseAPI.parse.isPending || receiptConsent.busy,
    isPickingPhoto,
    photo,
    pickPhoto,
    parseNow: () => { void receiptConsent.request(); },
    isParsing: expenseAPI.parse.isPending,
    provider,
    /** True once a receipt has been read into the form. */
    fromReceipt: provider !== "",
  };
}

/** The controller object returned by {@link useNewExpense}, consumed by the form editors. */
export type NewExpenseController = ReturnType<typeof useNewExpense>;
