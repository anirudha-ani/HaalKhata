/** Composite hook for the scan flow: photo → parsed draft → item assignment → save as itemized expense. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { centsToInput, todayISO } from "@haalkhata/shared/money/money";
import { draftItemsFromLines, itemsPayload } from "@/lib/expense/itemDraft";
import { useItemDraft } from "@/lib/hooks/useItemDraft";
import { PICKER_OPTIONS } from "../../../constants/imagePicker";
import { useScanAPI, type ReceiptPhotoInput } from "./useScanAPI";

/** A photo picked for scanning, plus its local URI for the preview. */
export interface ReceiptPhoto extends ReceiptPhotoInput {
  /** Local file URI used to render the preview image. */
  uri: string;
}

/**
 * Drives the whole receipt-scanning flow: choosing who the expense is with,
 * capturing or picking a photo, parsing it with AI into an editable draft
 * (items, tax, tip), assigning items to people, and saving everything as an
 * itemized expense.
 *
 * @param initialGroupId - Group id from the ?group param; preselects that
 *   group in the "who's on this?" picker (empty string for none).
 * @returns Everything from {@link useScanAPI} and the shared item draft
 *   (`items`, `tax`, `tip`, their editing helpers and derived totals), plus
 *   the picker state (`groupId`/`setGroupId`, `friendIds`/`toggleFriend`),
 *   the picked `photo` and `pickPhoto` (camera or library),
 *   `parseNow`/`isParsing` for the AI step, `merchant`, `date` and `payerId`
 *   with their setters, the `people` who can be assigned, and
 *   `canSave`/`save`/`isSaving`/`error` for submission.
 */
export function useScan(initialGroupId: string) {
  const scanAPI = useScanAPI();
  const router = useRouter();

  const [groupId, setGroupId] = useState(initialGroupId);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null);
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");

  // Draft (items stay null until a receipt has been parsed). The lines, the
  // assignments and the tax/tip inputs live in the same hook the expense
  // form uses for its itemized mode, so both edit receipts the same way.
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const draft = useItemDraft({ items: null, tax: "0.00", tip: "0.00" });
  const [payerId, setPayerId] = useState("");

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
  const effectivePayerId = payerId || scanAPI.me?.id || "";

  /**
   * Adds or removes someone from a one-off receipt. Dropping a person also
   * clears their item assignments and hands the payer role back to you, so a
   * person no longer on the receipt cannot reach the request.
   *
   * @param userId - Id of the person to toggle on this receipt.
   */
  const toggleFriend = (userId: string) => {
    if (!friendIds.includes(userId)) {
      setFriendIds([...friendIds, userId]);
      return;
    }
    setFriendIds(friendIds.filter((existingId) => existingId !== userId));
    draft.dropAssignee(userId);
    setPayerId((current) => (current === userId ? "" : current));
  };

  /**
   * Selects a group, or clears it by re-tapping the selected one. A group
   * supplies the whole cast — the server rejects a group expense with a
   * non-member on it — so the hand-picked people and every item assignment
   * referring to them are cleared.
   *
   * @param nextGroupId - Id of the group to attach the receipt to, "" for none.
   */
  const changeGroup = (nextGroupId: string) => {
    setGroupId(nextGroupId);
    setFriendIds([]);
    setPayerId("");
    draft.clearAssignees();
  };

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
      // Always JPEG: PICKER_OPTIONS sets `quality`, which makes the picker
      // re-encode. Passing through asset.mimeType would label an iPhone photo
      // "image/heic" while the bytes are already JPEG, and the server's
      // magic-byte check would reject its own successfully converted image.
      mediaType: "image/jpeg",
    });
    draft.replace(null, "0.00", "0.00");
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
        draft.replace(
          draftItemsFromLines(receipt.items),
          centsToInput(receipt.taxCents),
          centsToInput(receipt.tipCents),
        );
      },
      onError: (mutationError) => setError(errorMessage(mutationError)),
    });
  };

  // Saving requires a group or at least one other person, a complete draft
  // (priced, every item assigned), and a payer.
  const hasParticipants = groupId !== "" || friendIds.length > 0;
  const canSave =
    hasParticipants && draft.items !== null && draft.completeness.ok && effectivePayerId !== "";

  /** Saves the draft as an itemized expense and navigates to the new expense screen. */
  const save = () => {
    if (!canSave || draft.items === null) return;
    setError("");
    scanAPI.create.mutate(
      {
        groupId,
        description: merchant.trim() || "Receipt",
        amountCents: draft.grandTotalCents,
        currency: selectedGroup?.currency ?? scanAPI.me?.defaultCurrency ?? "USD",
        category: "food",
        expenseDate: date,
        splitType: "itemized",
        notes: "",
        payers: [{ userId: effectivePayerId, amountCents: draft.grandTotalCents }],
        splitSpecs: [],
        items: itemsPayload(draft.items),
        taxCents: draft.taxCents,
        tipCents: draft.tipCents,
      },
      {
        onSuccess: (expense) => router.replace(`/expenses/${expense.id}`),
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    );
  };

  return {
    ...scanAPI,
    ...draft,
    groupId,
    setGroupId: changeGroup,
    friendIds,
    toggleFriend,
    hasParticipants,
    photo,
    pickPhoto,
    parseNow,
    isParsing: scanAPI.parse.isPending,
    provider,
    merchant,
    setMerchant,
    date,
    setDate,
    payerId: effectivePayerId,
    setPayerId,
    people,
    selectedGroup,
    canSave,
    save,
    isSaving: scanAPI.create.isPending,
    error,
  };
}

/** Everything {@link useScan} returns; the single prop DraftEditor consumes. */
export type ScanController = ReturnType<typeof useScan>;
