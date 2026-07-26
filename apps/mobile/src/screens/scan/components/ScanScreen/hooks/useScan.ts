/** Composite hook for the scan flow: photo → parsed draft → item assignment → save as itemized expense. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { centsToInput, parseMoneyInput, todayISO } from "@haalkhata/shared/money/money";
import { PICKER_OPTIONS } from "../../../constants/imagePicker";
import { useScanAPI, type ReceiptPhotoInput } from "./useScanAPI";

/** One editable line item on the scanned-receipt draft. */
export interface DraftItem {
  /** Stable client-side key (items have no server id until saved). */
  key: string;
  /** Item name as parsed from the receipt or typed by the user. */
  name: string;
  /** How many of this item were bought (minimum 1). */
  quantity: number;
  /** Raw money input, e.g. "14.50". */
  total: string;
  /** Map of user id to whether that person shares this item. */
  assignees: Record<string, boolean>;
}

/** A photo picked for scanning, plus its local URI for the preview. */
export interface ReceiptPhoto extends ReceiptPhotoInput {
  /** Local file URI used to render the preview image. */
  uri: string;
}

/** Monotonic counter behind {@link nextDraftKey} (Hermes has no crypto.randomUUID). */
let draftKeySequence = 0;

/**
 * Returns a stable client-side key for a new draft item row.
 *
 * @returns A unique key string for this app session.
 */
function nextDraftKey(): string {
  draftKeySequence += 1;
  return `draft-${draftKeySequence}`;
}

/**
 * Drives the whole receipt-scanning flow: choosing who the expense is with,
 * capturing or picking a photo, parsing it with AI into an editable draft
 * (items, tax, tip), assigning items to people, and saving everything as an
 * itemized expense.
 *
 * @param initialGroupId - Group id from the ?group param; preselects that
 *   group in the "who is this with?" picker (empty string for none).
 * @returns Everything from {@link useScanAPI} plus the picker `context`, the
 *   picked `photo` and `pickPhoto` (camera or library), `parseNow`/`isParsing`
 *   for the AI step, the draft fields (`merchant`, `date`, `items`, `tax`,
 *   `tip`, `payerId`) with their editing helpers, derived totals
 *   (`itemsTotalCents`, `taxCents`, `tipCents`, `grandTotalCents`),
 *   `unassignedCount`, the `people` who can be assigned, and
 *   `canSave`/`save`/`isSaving`/`error` for submission.
 */
export function useScan(initialGroupId: string) {
  const scanAPI = useScanAPI();
  const router = useRouter();

  const [context, setContext] = useState(initialGroupId ? `g:${initialGroupId}` : "");
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");

  // Draft (items stay null until a receipt has been parsed).
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [taxInput, setTaxInput] = useState("0.00");
  const [tipInput, setTipInput] = useState("0.00");
  const [payerId, setPayerId] = useState("");

  // The picker encodes its choice as "g:<groupId>" or "f:<friendId>".
  const groupId = context.startsWith("g:") ? context.slice(2) : "";
  const friendId = context.startsWith("f:") ? context.slice(2) : "";
  const selectedGroup = scanAPI.groups.find(
    (groupSummary) => groupSummary.group?.id === groupId,
  )?.group;

  /** Everyone items can be assigned to: group members, or you plus the chosen friend. */
  const people: User[] = useMemo(() => {
    if (selectedGroup) {
      return selectedGroup.members.flatMap((member) => (member.user ? [member.user] : []));
    }
    if (friendId && scanAPI.me) {
      const friend = scanAPI.friends.find(
        (friendBalance) => friendBalance.user?.id === friendId,
      )?.user;
      return friend ? [scanAPI.me, friend] : [scanAPI.me];
    }
    return scanAPI.me ? [scanAPI.me] : [];
  }, [selectedGroup, friendId, scanAPI.friends, scanAPI.me]);

  // Defaults to the signed-in user until explicitly changed.
  const effectivePayerId = payerId || scanAPI.me?.id || "";

  /**
   * Captures or picks a receipt photo and resets any previously parsed draft.
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
      mediaType: asset.mimeType ?? "image/jpeg",
    });
    setItems(null);
    setProvider("");
  };

  /** Sends the chosen photo to the AI parser and loads the result into the draft. */
  const parseNow = () => {
    if (!photo) return;
    setError("");
    scanAPI.parse.mutate(photo, {
      onSuccess: (result) => {
        const receipt = result.receipt;
        if (!receipt) return;
        setProvider(result.provider);
        setMerchant(receipt.merchant || "Receipt");
        if (receipt.date) setDate(receipt.date);
        setTaxInput(centsToInput(receipt.taxCents));
        setTipInput(centsToInput(receipt.tipCents));
        setItems(
          receipt.items.map((item) => ({
            key: nextDraftKey(),
            name: item.name,
            quantity: item.quantity,
            total: centsToInput(item.totalCents),
            assignees: {},
          })),
        );
      },
      onError: (mutationError) => setError(errorMessage(mutationError)),
    });
  };

  /**
   * Applies a partial update to one draft item.
   *
   * @param index - Position of the item in the draft.
   * @param patch - Fields to merge into that item.
   */
  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((current) =>
      current
        ? current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
        : current,
    );
  };

  /**
   * Toggles whether a person shares a draft item.
   *
   * @param index - Position of the item in the draft.
   * @param userId - Id of the person to toggle on that item.
   */
  const toggleAssignee = (index: number, userId: string) => {
    setItems((current) =>
      current
        ? current.map((item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  assignees: { ...item.assignees, [userId]: !item.assignees[userId] },
                }
              : item,
          )
        : current,
    );
  };

  /**
   * Assigns every draft item to a person (leaving other assignees untouched).
   *
   * @param userId - Id of the person to add to every item.
   */
  const assignAllTo = (userId: string) => {
    setItems((current) =>
      current
        ? current.map((item) => ({
            ...item,
            assignees: { ...item.assignees, [userId]: true },
          }))
        : current,
    );
  };

  /**
   * Removes one item from the draft.
   *
   * @param index - Position of the item to remove.
   */
  const removeItem = (index: number) => {
    setItems((current) =>
      current ? current.filter((_item, itemIndex) => itemIndex !== index) : current,
    );
  };

  /** Appends a blank item row to the draft. */
  const addItem = () => {
    setItems((current) => [
      ...(current ?? []),
      { key: nextDraftKey(), name: "", quantity: 1, total: "", assignees: {} },
    ]);
  };

  // Derived totals: items subtotal plus the tax/tip inputs.
  const itemsTotalCents = (items ?? []).reduce(
    (sumCents, item) => sumCents + (parseMoneyInput(item.total) ?? 0),
    0,
  );
  const taxCents = parseMoneyInput(taxInput) ?? 0;
  const tipCents = parseMoneyInput(tipInput) ?? 0;
  const grandTotalCents = itemsTotalCents + taxCents + tipCents;

  const unassignedCount = (items ?? []).filter(
    (item) => !Object.values(item.assignees).some(Boolean),
  ).length;

  // Saving requires a context, at least one priced item, no unassigned items, and a payer.
  const canSave =
    context !== "" &&
    items !== null &&
    items.length > 0 &&
    itemsTotalCents > 0 &&
    unassignedCount === 0 &&
    effectivePayerId !== "";

  /** Saves the draft as an itemized expense and navigates to the new expense screen. */
  const save = () => {
    if (!canSave || items === null) return;
    setError("");
    scanAPI.create.mutate(
      {
        groupId,
        description: merchant.trim() || "Receipt",
        amountCents: grandTotalCents,
        currency: selectedGroup?.currency ?? scanAPI.me?.defaultCurrency ?? "USD",
        category: "food",
        expenseDate: date,
        splitType: "itemized",
        notes: "",
        payers: [{ userId: effectivePayerId, amountCents: grandTotalCents }],
        splitSpecs: [],
        items: items.map((item) => ({
          id: "",
          name: item.name.trim() || "Item",
          quantity: item.quantity,
          totalCents: parseMoneyInput(item.total) ?? 0,
          assignments: Object.entries(item.assignees)
            .filter(([, isAssigned]) => isAssigned)
            .map(([userId]) => ({ userId, weight: 1 })),
        })),
        taxCents,
        tipCents,
      },
      {
        onSuccess: (expense) => router.replace(`/expenses/${expense.id}`),
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    );
  };

  return {
    ...scanAPI,
    context,
    setContext,
    photo,
    pickPhoto,
    parseNow,
    isParsing: scanAPI.parse.isPending,
    provider,
    merchant,
    setMerchant,
    date,
    setDate,
    items,
    updateItem,
    toggleAssignee,
    assignAllTo,
    removeItem,
    addItem,
    tax: taxInput,
    setTax: setTaxInput,
    tip: tipInput,
    setTip: setTipInput,
    payerId: effectivePayerId,
    setPayerId,
    people,
    selectedGroup,
    itemsTotalCents,
    taxCents,
    tipCents,
    grandTotalCents,
    unassignedCount,
    canSave,
    save,
    isSaving: scanAPI.create.isPending,
    error,
  };
}

/** Everything {@link useScan} returns; the single prop DraftEditor consumes. */
export type ScanController = ReturnType<typeof useScan>;
