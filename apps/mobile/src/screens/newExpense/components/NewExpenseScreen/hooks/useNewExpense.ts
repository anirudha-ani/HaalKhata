/** Composite expense-form hook: field state, receipt scanning, payer/split validation, submit. */

import { canPreserveSplitType } from "@haalkhata/shared/expense/form/preserveSplit";
import { receiptCurrencyError } from "@haalkhata/shared/expense/form/receiptCurrency";
import { expenseFormCurrency } from "@haalkhata/shared/expense/form/formCurrency";
import { useReceiptScanConsent } from "@/lib/receipt/hooks/useReceiptScanConsent";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import { successFeedback } from "@/lib/motion/haptics";
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
import {
  buildItemsPayload as itemsPayload,
  liveDraft,
  withNewcomersTicked,
  previewSplitShares,
  unclaimedUnlessPicked,
  type DraftLineItem,
} from "@haalkhata/shared/expense/form/splitForm";
import { draftExpenseState } from "@haalkhata/shared/expense/merge/editDraft";
import { useItemDraft } from "@/lib/hooks/useItemDraft";
import { prepareReceiptPhoto } from "../../../utils/prepareReceiptPhoto";
import { PICKER_OPTIONS } from "../../../constants/imagePicker";
import { buildInitialValues, type ExpenseFormInitial } from "../../../utils/initialValues";
import {
  buildSplitSpecs,
  checkPayers,
  checkSplit,
  type FormSplitType,
} from "@haalkhata/shared/expense/form/splitForm";
import { useExpenseEditSync, type TakenChanges } from "./useExpenseEditSync";
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
  const [error, setError] = useState("");
  // Receipt state. A scan is a way of filling this form in, not a separate
  // flow: the photo is parsed into the same item draft the Items split edits.
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [provider, setProvider] = useState("");
  const [sharingOnStart, setSharingOnStart] = useState(false);
  // One id per attempt at saving: a retry after a lost response sends the
  // same one and gets the expense the first attempt stored, not a second.
  const operationIdRef = useRef("");
  if (operationIdRef.current === "") operationIdRef.current = newOperationId();
  // What the last attempt at saving an edit sent: the same again is a retry
  // and keeps its id; anything else is a new attempt and gets a new one.
  const lastEditAttempt = useRef("");
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
    expenseAPI.editing?.liveSplit ? { multiPayer, singlePayerId, payerAmounts } : undefined,
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
    expenseAPI.parse.mutate({ ...photo, consentVersion, currency }, {
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
    if (parts.has("taxCents")) itemDraft.setTax(centsToInput(merged.taxCents, currency));
    if (parts.has("tipCents")) itemDraft.setTip(centsToInput(merged.tipCents, currency));
    if (parts.has("line") || parts.has("share")) {
      itemDraft.adoptLines(merged.lines);
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
      itemDraft.replace(saved.items, saved.tax, saved.tip);
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
        description, category, date, notes, splitType, totalCents,
        previewShares: isItemized
          ? itemDraft.previewShares
          : previewSplitShares({ splitType, totalCents, participantIds, inputs: splitInputs, currency }),
        multiPayer, singlePayerId, payerAmounts,
        items: itemDraft.items ?? [],
        taxCents: itemDraft.taxCents,
        tipCents: itemDraft.tipCents,
        currency,
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
  const buildRequest = (total: number, lines: readonly DraftLineItem[]) => {
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
      items: isItemized ? itemsPayload([...lines], currency) : [],
      taxCents: isItemized ? itemDraft.taxCents : 0,
      tipCents: isItemized ? itemDraft.tipCents : 0,
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
    const draft = liveDraft({
      description, isItemized, items: itemDraft.items ?? [], totalCents,
      taxCents: itemDraft.taxCents, tipCents: itemDraft.tipCents, currency,
    });
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
          successFeedback();
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
    const request = buildRequest(totalCents, itemDraft.items ?? []);

    // Land on the thing you just made, not on a list: seeing the split it
    // landed on is the confirmation that matters. An edit goes back to the
    // bill it was opened from rather than stacking a second copy on top.
    const onSuccess = (saved: { id: string }) => {
      successFeedback();
      operationIdRef.current = newOperationId();
      lastEditAttempt.current = "";
      if (editExpenseId) router.dismissTo(`/expenses/${saved.id}`);
      else router.replace(`/expenses/${saved.id}`);
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
