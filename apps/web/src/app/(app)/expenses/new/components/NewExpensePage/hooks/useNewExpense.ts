"use client";
/** Composite expense-form hook: field state, payer/split validation, submit. */

import { canPreserveSplitType } from "@haalkhata/shared/expense/form/preserveSplit";
import { receiptCurrencyError } from "@haalkhata/shared/expense/form/receiptCurrency";
import { expenseFormCurrency } from "@haalkhata/shared/expense/form/formCurrency";
import { useReceiptScanConsent } from "@/lib/receipt/hooks/useReceiptScanConsent";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage } from "@/lib/api/connect";
import { newOperationId } from "@/lib/operations/operationId";
import { prepareReceiptImage } from "@/lib/image/receiptImage";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import {
  initialExpensePeopleIds,
  resolveExpensePeople,
  toggleExpensePerson,
} from "@haalkhata/shared/expense/participants";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";
import { adoptDraftLines, draftExpenseState } from "@haalkhata/shared/expense/merge/editDraft";
import {
  buildItemsPayload,
  buildSplitSpecs,
  liveDraft,
  withNewcomersTicked,
  checkItemized,
  checkPayers,
  checkSplit,
  includeInEveryItem,
  itemizedTotals,
  previewItemizedShares,
  previewSplitShares,
  shareEveryItemWith,
  unclaimedUnlessPicked,
  type DraftLineItem,
  type FormSplitType,
} from "@haalkhata/shared/expense/form/splitForm";
import { buildInitialValues, type ExpenseFormInitial } from "../../../utils/initialValues";
import { useExpenseEditSync, type TakenChanges } from "./useExpenseEditSync";
import type { useNewExpenseAPI } from "./useNewExpenseAPI";
import { omitKey } from "../utils/omitKey";

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
  const [savedSplit] = useState(expenseAPI.editing?.expense);

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
  const [items, setItems] = useState<DraftLineItem[]>(initial.items);
  const [taxInput, setTaxInput] = useState(initial.taxInput);
  const [tipInput, setTipInput] = useState(initial.tipInput);
  const [error, setError] = useState("");
  /** Closes the error popup. The next action clears it anyway; this serves the dismiss button. */
  const dismissError = useCallback(() => setError(""), []);

  // Receipt state. A scan is a way of filling this form in, not a separate
  // kind of expense, so it lives on the same controller as everything else.
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [sharingOnStart, setSharingOnStart] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  // One id per attempt at saving: a retry after a lost response sends the
  // same one and gets the expense the first attempt stored, not a second.
  const [firstOperationId] = useState(newOperationId);
  const operationIdRef = useRef(firstOperationId);
  // What the last attempt at saving an edit sent: the same again is a retry
  // and keeps its id; anything else is a new attempt and gets a new one.
  const lastEditAttempt = useRef("");

  const selectedGroup = expenseAPI.groups.find(
    (groupSummary) => groupSummary.group?.id === groupId,
  )?.group;

  // Inputs, previews and the saved request must share the original currency
  // when editing; changing a profile default is never a currency conversion.
  const currency = expenseFormCurrency(selectedGroup?.currency, expenseAPI.editing?.expense?.currency, expenseAPI.me?.defaultCurrency);

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
    setItems((current) =>
      wasIncluded
        ? current.map((item) => ({ ...item, assignees: omitKey(item.assignees, userId) }))
        : includeInEveryItem(current, userId),
    );
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
          ?.group?.members.flatMap((member) => (member.user && !member.user.deleted ? [member.user.id] : [])) ?? [])
      : [currentUserId];
    setGroupId(nextGroupId);
    setPersonIds(nextGroupId ? null : []);
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

  /**
   * Replaces the whole assignee map of one item. The Everyone chip puts the
   * entire cast on (or off) a line in one update rather than one re-render
   * per person.
   *
   * @param index - Position of the item in the draft.
   * @param assignees - New portion counts by user id; an empty map leaves the item unassigned.
   */
  const setItemAssignees = (index: number, assignees: Record<string, number>) =>
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, assignees } : item)),
    );

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  useEffect(() => () => URL.revokeObjectURL(receiptUrl), [receiptUrl]);

  /**
   * Sends the chosen photo to the AI parser and pours the result into this
   * form: merchant becomes the description, and the extracted lines become
   * the itemized draft with the split switched to match.
   * @param consentVersion Current sharing terms authorized for this account.
   */
  const parsePhoto = (consentVersion: string) => {
    if (!file) return;
    setError("");
    expenseAPI.parse.mutate({ file, consentVersion, currency }, {
      onSuccess: (result) => {
        // The server hands back the JPEG it actually showed the model — the
        // upload after rotation, downscaling and HEIC transcoding. Showing
        // that rather than the raw file is what makes an iPhone receipt
        // viewable at all, and it is the image the numbers came from.
        if (result.normalizedImage.length > 0) {
          const blob = new Blob([result.normalizedImage as BlobPart], { type: "image/jpeg" });
          setReceiptUrl(URL.createObjectURL(blob));
        }
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
        setTaxInput(centsToInput(receipt.taxCents, receiptCurrency));
        setTipInput(centsToInput(receipt.tipCents, receiptCurrency));
        // Parsed rows start shared by everyone: splitting the whole bill
        // evenly is the common case, so it costs zero taps and the user only
        // touches the exceptions.
        const everyone = Object.fromEntries(receiptPeople.map((person) => [person.id, 1]));
        setItems(
          receipt.items.map((item) => ({
            key: nextDraftKey(),
            name: item.name,
            quantity: item.quantity,
            total: centsToInput(item.totalCents, receiptCurrency),
            assignees: { ...everyone },
          })),
        );
        setSplitType("itemized");
      },
      onError: (mutationError) => setError(errorMessage(mutationError)),
    });
  };

  const receiptConsent = useReceiptScanConsent(parsePhoto);

  /**
   * Stores a newly chosen receipt photo and clears anything a previous scan
   * produced, so a second photo cannot leave the first one's items behind.
   *
   * The photo is prepared to the upload standard first
   * ({@link prepareReceiptImage}): converted to JPEG, turned upright and
   * shrunk, here on the device, since the server only checks it. A photo the
   * browser cannot read is refused here, beside the control, with words to
   * act on. `isPreparing` covers the decode, which is a visible pause on a
   * large photo and would otherwise look like a dead tap.
   *
   * @param picked - The image file chosen or captured by the user.
   */
  const pickFile = async (picked: File) => {
    if (expenseAPI.parse.isPending || receiptConsent.busy || receiptConsent.prompt) return;
    setProvider("");
    setError("");
    setReceiptUrl("");
    setIsPreparing(true);
    try {
      const prepared = await prepareReceiptImage(picked);
      setFile(prepared);
      setPreviewUrl(URL.createObjectURL(prepared));
    } catch (prepareError) {
      setError(errorMessage(prepareError));
    } finally {
      setIsPreparing(false);
    }
  };

  const taxCents = parseMoneyInput(taxInput, currency) ?? 0;
  const tipCents = parseMoneyInput(tipInput, currency) ?? 0;
  const itemized = itemizedTotals(items, taxCents, tipCents, currency);

  /**
   * Sets the tip to a percentage of the items subtotal (before tax), the way
   * tip is normally reckoned on a restaurant bill.
   *
   * @param percent - Tip percentage to apply, e.g. 18.
   */
  const applyTipPercent = (percent: number) =>
    setTipInput(centsToInput(Math.round((itemized.itemsTotalCents * percent) / 100), currency));

  // In itemized mode the total is derived from the line items; the amount
  // input is read-only and the server recomputes (and re-verifies) the same sum.
  const totalCents = isItemized ? itemized.totalCents : parseMoneyInput(amount, currency);
  const participantIds = people
    .filter((person) => checked[person.id])
    .map((person) => person.id);

  const splitCheck = isItemized
    ? checkItemized(items, currency, expenseAPI.editing?.liveSplit !== undefined)
    : checkSplit({ splitType, totalCents, participantIds, inputs: splitInputs, currency });
  // Live "what each person owes" figures for the summary, from the same
  // allocator the server runs, so the preview is exactly what gets saved.
  const previewShares = isItemized
    ? previewItemizedShares(items, taxCents, tipCents, currency)
    : previewSplitShares({ splitType, totalCents, participantIds, inputs: splitInputs, currency });
  const payerCheck = checkPayers(totalCents, multiPayer, payerAmounts, currency);

  /**
   * Puts what somebody else saved into the form, leaving everything this
   * person has touched as it is.
   *
   * @param taken - The parts to take, and their values.
   */
  const takeIn = ({ parts, merged, latest }: TakenChanges) => {
    const saved = buildInitialValues({ initialGroupId: "", initialFriendId: "" }, expenseAPI.me?.id ?? "", latest);
    if (parts.has("description")) setDescription(merged.description);
    if (parts.has("category")) setCategory(merged.category);
    if (parts.has("expenseDate")) setDate(merged.expenseDate);
    if (parts.has("notes")) setNotes(merged.notes);
    if (parts.has("taxCents")) setTaxInput(centsToInput(merged.taxCents, currency));
    if (parts.has("tipCents")) setTipInput(centsToInput(merged.tipCents, currency));
    if (parts.has("line") || parts.has("share")) {
      setItems((current) => adoptDraftLines(current, merged.lines, currency));
      // A line can name somebody a hand-picked cast does not have yet.
      if (!groupId) {
        const onLines = merged.lines.flatMap((line) => Object.keys(line.shares));
        setPersonIds((current) => [...new Set([...(current ?? []), ...onLines])]);
      }
    }
    if (parts.has("money")) {
      setAmount(saved.amount);
      setSplitType(saved.splitType);
      setSplitInputs(saved.splitInputs);
      setCheckedOverride(saved.checked);
      setItems(saved.items);
      setTaxInput(saved.taxInput);
      setTipInput(saved.tipInput);
      if (!groupId) setPersonIds(saved.friendIds);
    }
    if (parts.has("payers")) {
      setMultiPayer(saved.multiPayer);
      setSinglePayerId(saved.singlePayerId);
      setPayerAmounts(saved.payerAmounts);
    }
  };

  /**
   * Brings onto the form whoever has joined since it opened. Nobody is added
   * to a part of the bill somebody has already filled in by hand: they appear
   * in the cast, and on an even split they are ticked like anyone else.
   *
   * @param userIds - Everyone on the saved expense.
   */
  const addPeople = (userIds: string[]) => {
    const onForm = new Set(personIds);
    const newcomers = userIds.filter((userId) => userId !== expenseAPI.me?.id && !onForm.has(userId));
    if (newcomers.length === 0) return;
    // A group's roster is its own read, which has not heard of them yet.
    if (groupId) expenseAPI.refreshGroups();
    if (groupId && personIds === null) return;
    setPersonIds((current) => [...new Set([...(current ?? []), ...newcomers])]);
    setCheckedOverride((current) => withNewcomersTicked(current, newcomers));
  };

  const editSync = useExpenseEditSync({
    opened: expenseAPI.editing?.expense,
    savedVersion: expenseAPI.savedVersion,
    versionCheckedAt: expenseAPI.versionCheckedAt,
    myId: expenseAPI.me?.id ?? "",
    isSaving: expenseAPI.update.isPending,
    currency,
    readLatest: expenseAPI.readLatest,
    readForm: () =>
      draftExpenseState({
        description, category, date, notes, splitType, totalCents, previewShares,
        multiPayer, singlePayerId, payerAmounts, items, taxCents, tipCents, currency,
      }),
    takeIn,
    addPeople,
  });

  const canSubmit =
    description.trim() !== "" &&
    totalCents !== null &&
    totalCents > 0 &&
    splitCheck.ok &&
    payerCheck.ok &&
    editSync.conflicts.length === 0;

  const preserveSplitType = canPreserveSplitType(savedSplit, {
    groupId, currency, splitType, amountCents: totalCents ?? 0,
    splits: participantIds.map((userId) => ({ userId, owedCents: parseMoneyInput(splitInputs[userId] ?? "", currency) ?? -1 })),
  });

  /**
   * Builds the request from the current fields.
   *
   * @param total - The expense's total.
   * @param lines - The lines to save.
   * @returns The create request, which an edit carries too.
   */
  const buildRequest = (total: number, lines: DraftLineItem[]) => {
    const payers = multiPayer
      ? Object.entries(payerAmounts)
          .map(([userId, value]) => ({ userId, amountCents: parseMoneyInput(value, currency) ?? 0 }))
          .filter((payer) => payer.amountCents > 0)
      : [{ userId: singlePayerId, amountCents: total }];
    return {
      groupId,
      description: description.trim(),
      amountCents: total,
      currency,
      category,
      expenseDate: date,
      splitType,
      notes,
      payers,
      splitSpecs: buildSplitSpecs({
        splitType,
        totalCents: total,
        participantIds,
        inputs: splitInputs,
        currency,
      }),
      items: isItemized ? buildItemsPayload(lines, currency) : [],
      taxCents: isItemized ? taxCents : 0,
      tipCents: isItemized ? tipCents : 0,
      // Names this attempt: a retry after a lost response sends the same id
      // and gets the expense the first attempt stored, not a second one.
      operationId: operationIdRef.current,
    };
  };

  /** Saves the bill as it stands and opens it to the table. */
  const startLive = () => {
    setError("");
    if (editExpenseId) {
      setSharingOnStart(true);
      expenseAPI.startLive.mutate(undefined, {
        onError: (mutationError) => setError(errorMessage(mutationError)),
      });
      return;
    }
    const draft = liveDraft({ description, isItemized, items, totalCents, taxCents, tipCents, currency });
    const request = buildRequest(draft.totalCents, unclaimedUnlessPicked(draft.lines, people.map((person) => person.id)));
    // Half-typed amounts cannot be saved yet, so they start even and whoever
    // is at the table finishes them. Nothing here is a reason to stop.
    const unfinishedSplit = !isItemized && !splitCheck.ok;
    expenseAPI.create.mutate(
      {
        ...request,
        description: draft.description,
        splitType: unfinishedSplit ? "equal" : request.splitType,
        splitSpecs: unfinishedSplit
          ? buildSplitSpecs({ splitType: "equal", totalCents: draft.totalCents, participantIds, inputs: splitInputs, currency })
          : request.splitSpecs,
        payers: payerCheck.ok ? request.payers : [{ userId: singlePayerId, amountCents: draft.totalCents }],
        startLiveSplit: true,
      },
      {
        onSuccess: (saved) => {
          operationIdRef.current = newOperationId();
          router.replace(`/expenses/new?edit=${saved.id}&invite=1`);
        },
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    );
  };

  /** Builds the request from the current fields and fires create or update. */
  const submit = () => {
    if (!canSubmit || totalCents === null) return;
    setError("");
    const request = buildRequest(totalCents, items);

    // Land on the thing you just made, not on the list you started from.
    // Both RPCs return the saved Expense, so the id is already here — and
    // seeing the split it landed on is the confirmation that matters, far
    // more than a group page where the new row is one line among many.
    const onSuccess = (saved: { id: string }) => {
      operationIdRef.current = newOperationId();
      lastEditAttempt.current = "";
      router.push(`/expenses/${saved.id}`);
    };
    if (editExpenseId) {
      const attempt = JSON.stringify([{ ...request, operationId: "" }, preserveSplitType, editSync.base?.version]);
      if (lastEditAttempt.current !== "" && lastEditAttempt.current !== attempt) {
        operationIdRef.current = newOperationId();
      }
      lastEditAttempt.current = attempt;
      expenseAPI.update.mutate(
        {
          expenseId: editExpenseId,
          expense: { ...request, operationId: operationIdRef.current },
          preserveSplitType,
          base: editSync.base,
        },
        {
          onSuccess,
          // Somebody else changed the same thing: the form shows that and
          // asks, so it is not an error. Anything else is.
          onError: (mutationError) => {
            editSync.answerRefusedSave(mutationError).then(
              (shown) => {
                if (!shown) setError(errorMessage(mutationError));
              },
              (readError) => setError(errorMessage(readError)),
            );
          },
        },
      );
    } else {
      const onError = (mutationError: unknown) => setError(errorMessage(mutationError));
      expenseAPI.create.mutate(request, { onSuccess, onError });
    }
  };

  return {
    splitNotice: preserveSplitType ? initial.splitNotice : undefined,
    currency,
    me: expenseAPI.me,
    groups: expenseAPI.groups,
    friends: expenseAPI.friends,
    isEdit: editExpenseId !== "",
    groupId,
    setGroupId: changeGroup,
    friendIds,
    togglePerson,
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
    setItemAssignees,
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
    dismissError,
    submit,
    startLive,
    isStartingLive: expenseAPI.create.isPending || expenseAPI.startLive.isPending,
    liveSplit: expenseAPI.editing?.liveSplit,
    liveUsers: expenseAPI.editing?.users ?? [],
    sharingOnStart,
    // Somebody else editing at the same time.
    editNote: editSync.note,
    editConflicts: editSync.conflicts,
    editChangedBy: editSync.changedBy,
    keepMyEdit: editSync.keepMine,
    takeSavedEdit: editSync.takeSaved,
    isSaving: expenseAPI.create.isPending || expenseAPI.update.isPending,
    // Receipt scanning.
    receiptConsent,
    isReceiptBusy: expenseAPI.parse.isPending || receiptConsent.busy,
    file,
    previewUrl,
    receiptUrl,
    pickFile,
    isPreparing,
    parseNow: () => { void receiptConsent.request(); },
    isParsing: expenseAPI.parse.isPending,
    provider,
    // A quantity column is only worth its width when a bill was actually read
    // off paper; typed items have no quantity to show.
    fromReceipt: provider !== "",
  };
}

/** The controller object returned by {@link useNewExpense}, consumed by the form editors. */
export type NewExpenseController = ReturnType<typeof useNewExpense>;
