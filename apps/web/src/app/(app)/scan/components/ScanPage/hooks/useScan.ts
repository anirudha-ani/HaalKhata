"use client";
/** Composite hook for the scan flow: photo → parsed draft → item grid → save as itemized expense. */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage } from "@/lib/api/connect";
import { centsToInput, parseMoneyInput, todayISO } from "@haalkhata/shared/money/money";
import {
  buildItemsPayload,
  checkItemized,
  checkPayers,
  itemizedTotals,
  previewItemizedShares,
  type DraftLineItem,
} from "@/lib/expense/splitForm";
import { useScanAPI } from "./useScanAPI";

/**
 * Drives the whole receipt-scanning flow: choosing who the receipt is with,
 * picking and previewing a photo, parsing it with AI into an editable draft
 * (items, tax, tip), assigning items to people in the same grid the expense
 * form uses, and saving everything as an itemized expense.
 *
 * @param initialGroupId - Group id from the ?group search param; preselects
 *   that group in the "who's on this?" picker (empty string for none).
 * @param initialFriendId - Friend id from the ?friend search param; seeds the
 *   one-off cast with that person (empty string for none).
 * @returns Everything from {@link useScanAPI} plus the picker state
 *   (`groupId`/`setGroupId`, `friendIds`/`toggleFriend`), the upload
 *   (`pickFile`, `previewUrl`, `receiptUrl`), `parseNow`/`isParsing` for the AI
 *   step, the draft (`merchant`, `date`, `items`, `tax`, `tip`) with its
 *   editing helpers, the payer state (`multiPayer`, `singlePayerId`,
 *   `payerAmounts`), derived totals and `previewShares`, the `splitCheck` /
 *   `payerCheck` validations, and `canSave`/`save`/`isSaving`/`error`.
 */
export function useScan(initialGroupId: string, initialFriendId = "") {
  const scanAPI = useScanAPI();
  const router = useRouter();

  const [groupId, setGroupId] = useState(initialGroupId);
  const [friendIds, setFriendIds] = useState<string[]>(
    !initialGroupId && initialFriendId ? [initialFriendId] : [],
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");

  // Draft (items stay null until a receipt has been parsed).
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState<DraftLineItem[] | null>(null);
  const [taxInput, setTaxInput] = useState("0.00");
  const [tipInput, setTipInput] = useState("0.00");
  const [unevenShares, setUnevenShares] = useState(false);
  const [multiPayer, setMultiPayer] = useState(false);
  const [singlePayerId, setSinglePayerId] = useState("");
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});

  const selectedGroup = scanAPI.groups.find(
    (groupSummary) => groupSummary.group?.id === groupId,
  )?.group;

  /**
   * Everyone items can be assigned to, you first: a group's whole roster when
   * a group is selected, otherwise you plus the people picked by hand.
   */
  const people: User[] = useMemo(() => {
    const currentUser = scanAPI.me;
    if (!currentUser) return [];
    const others = selectedGroup
      ? selectedGroup.members.flatMap((member) => (member.user ? [member.user] : []))
      : friendIds.flatMap((userId) => {
          const friend = scanAPI.friends.find(
            (friendBalance) => friendBalance.user?.id === userId,
          )?.user;
          return friend ? [friend] : [];
        });
    return [currentUser, ...others.filter((person) => person.id !== currentUser.id)];
  }, [selectedGroup, friendIds, scanAPI.friends, scanAPI.me]);

  // Defaults to the signed-in user until explicitly changed.
  const effectivePayerId = singlePayerId || scanAPI.me?.id || "";

  /**
   * Adds or removes someone from a one-off receipt. Somebody joining goes onto
   * every line, matching the grid's "new items are shared by everyone" default
   * from the other direction — you untick their exceptions. Somebody leaving
   * is scrubbed from every line and from the payer state, so a person no
   * longer on the receipt cannot reach the request.
   *
   * @param userId - Id of the person to toggle on this receipt.
   */
  const toggleFriend = (userId: string) => {
    if (!friendIds.includes(userId)) {
      setFriendIds([...friendIds, userId]);
      setItems((current) =>
        current
          ? current.map((item) => ({ ...item, assignees: { ...item.assignees, [userId]: 1 } }))
          : current,
      );
      return;
    }
    setFriendIds(friendIds.filter((existingId) => existingId !== userId));
    setItems((current) =>
      current
        ? current.map((item) => {
            const { [userId]: _dropped, ...assignees } = item.assignees;
            return { ...item, assignees };
          })
        : current,
    );
    setPayerAmounts((current) => {
      const { [userId]: _dropped, ...rest } = current;
      return rest;
    });
    setSinglePayerId((current) => (current === userId ? "" : current));
  };

  /**
   * Selects a group (or "" for a one-off receipt). A group supplies the whole
   * cast — the server rejects a group expense with a non-member on it — so the
   * hand-picked people, their item assignments and their paid amounts go.
   *
   * @param nextGroupId - Id of the group to attach the receipt to, "" for none.
   */
  const changeGroup = (nextGroupId: string) => {
    setGroupId(nextGroupId);
    setFriendIds([]);
    setSinglePayerId("");
    setPayerAmounts({});
    setItems((current) =>
      current ? current.map((item) => ({ ...item, assignees: {} })) : current,
    );
  };

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  useEffect(() => () => URL.revokeObjectURL(receiptUrl), [receiptUrl]);

  /**
   * Stores a newly chosen receipt photo, swaps the object-URL preview, and
   * resets any previously parsed draft.
   *
   * @param picked - The image file chosen or captured by the user.
   */
  const pickFile = (picked: File) => {
    setFile(picked);
    setPreviewUrl((previousUrl) => {
      URL.revokeObjectURL(previousUrl);
      return URL.createObjectURL(picked);
    });
    setReceiptUrl((previousUrl) => {
      URL.revokeObjectURL(previousUrl);
      return "";
    });
    setItems(null);
    setProvider("");
    setError("");
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

  /** Sends the chosen photo to the AI parser and loads the result into the draft. */
  const parseNow = () => {
    if (!file) return;
    setError("");
    scanAPI.parse.mutate(file, {
      onSuccess: (result) => {
        const receipt = result.receipt;
        if (!receipt) return;
        setProvider(result.provider);
        setMerchant(receipt.merchant || "Receipt");
        if (receipt.date) setDate(receipt.date);
        setTaxInput(centsToInput(receipt.taxCents));
        setTipInput(centsToInput(receipt.tipCents));
        // Parsed rows start shared by everyone on the receipt: splitting the
        // whole bill evenly is the common case, so it costs zero taps and the
        // user only touches the exceptions.
        const everyone = Object.fromEntries(people.map((person) => [person.id, 1]));
        setItems(
          receipt.items.map((item) => ({
            key: crypto.randomUUID(),
            name: item.name,
            quantity: item.quantity,
            total: centsToInput(item.totalCents),
            assignees: { ...everyone },
          })),
        );
        // The server hands back the JPEG it actually showed the model — the
        // upload after rotation, downscaling and HEIC transcoding. Showing that
        // rather than the raw file is what makes an iPhone receipt viewable at
        // all, and it is the image the extracted numbers came from.
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

  /**
   * Applies a partial update to one draft item.
   *
   * @param index - Position of the item in the draft.
   * @param patch - Fields to merge into that item.
   */
  const updateItem = (index: number, patch: Partial<DraftLineItem>) => {
    setItems((current) =>
      current
        ? current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
        : current,
    );
  };

  /**
   * Sets a person's share weight on one item. A weight of 0 (or less) takes
   * them off the item entirely rather than storing a zero.
   *
   * @param index - Position of the item in the draft.
   * @param userId - Id of the person whose weight is changing.
   * @param weight - The new share weight; 0 or less removes the assignment.
   */
  const setAssigneeWeight = (index: number, userId: string, weight: number) => {
    setItems((current) =>
      current
        ? current.map((item, itemIndex) => {
            if (itemIndex !== index) return item;
            const assignees = { ...item.assignees };
            if (weight > 0) assignees[userId] = weight;
            else delete assignees[userId];
            return { ...item, assignees };
          })
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

  /** Appends a blank item row, pre-shared by everyone on the receipt. */
  const addItem = () => {
    setItems((current) => [
      ...(current ?? []),
      {
        key: crypto.randomUUID(),
        name: "",
        total: "",
        assignees: Object.fromEntries(people.map((person) => [person.id, 1])),
      },
    ]);
  };

  const taxCents = parseMoneyInput(taxInput) ?? 0;
  const tipCents = parseMoneyInput(tipInput) ?? 0;
  const draftItems = items ?? [];
  const { itemsTotalCents, totalCents } = itemizedTotals(draftItems, taxCents, tipCents);
  // Live "what each person owes", from the very same allocator the server
  // runs — so the totals row is exactly what gets saved.
  const previewShares = previewItemizedShares(draftItems, taxCents, tipCents);

  /**
   * Sets the tip to a percentage of the items subtotal (before tax), the way
   * tip is normally reckoned on a restaurant bill.
   *
   * @param percent - Tip percentage to apply, e.g. 18.
   */
  const applyTipPercent = (percent: number) =>
    setTipInput(((itemsTotalCents * percent) / 100 / 100).toFixed(2));

  const hasParticipants = groupId !== "" || friendIds.length > 0;
  const splitCheck = checkItemized(draftItems);
  const payerCheck = checkPayers(totalCents, multiPayer, payerAmounts);
  const canSave = hasParticipants && items !== null && splitCheck.ok && payerCheck.ok;

  /** Saves the draft as an itemized expense and navigates to the new expense page. */
  const save = () => {
    if (!canSave || items === null) return;
    setError("");
    const payers = multiPayer
      ? Object.entries(payerAmounts)
          .map(([userId, value]) => ({ userId, amountCents: parseMoneyInput(value) ?? 0 }))
          .filter((payer) => payer.amountCents > 0)
      : [{ userId: effectivePayerId, amountCents: totalCents }];

    scanAPI.create.mutate(
      {
        groupId,
        description: merchant.trim() || "Receipt",
        amountCents: totalCents,
        currency: selectedGroup?.currency ?? scanAPI.me?.defaultCurrency ?? "USD",
        category: "food",
        expenseDate: date,
        splitType: "itemized",
        notes: "",
        payers,
        splitSpecs: [],
        items: buildItemsPayload(items),
        taxCents,
        tipCents,
      },
      {
        onSuccess: (expense) => router.push(`/expenses/${expense.id}`),
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    );
  };

  return {
    ...scanAPI,
    groupId,
    setGroupId: changeGroup,
    friendIds,
    toggleFriend,
    hasParticipants,
    file,
    previewUrl,
    receiptUrl,
    isPreviewRenderable,
    fileName: file?.name ?? "",
    pickFile,
    parseNow,
    isParsing: scanAPI.parse.isPending,
    provider,
    merchant,
    setMerchant,
    date,
    setDate,
    items,
    updateItem,
    setAssigneeWeight,
    removeItem,
    addItem,
    unevenShares,
    setUnevenShares,
    tax: taxInput,
    setTax: setTaxInput,
    tip: tipInput,
    setTip: setTipInput,
    applyTipPercent,
    multiPayer,
    setMultiPayer,
    singlePayerId: effectivePayerId,
    setSinglePayerId,
    payerAmounts,
    setPayerAmounts,
    people,
    selectedGroup,
    itemsTotalCents,
    taxCents,
    tipCents,
    totalCents,
    previewShares,
    splitCheck,
    payerCheck,
    canSave,
    save,
    isSaving: scanAPI.create.isPending,
    error,
  };
}

/** Everything {@link useScan} returns; the single prop DraftEditor consumes. */
export type ScanController = ReturnType<typeof useScan>;
