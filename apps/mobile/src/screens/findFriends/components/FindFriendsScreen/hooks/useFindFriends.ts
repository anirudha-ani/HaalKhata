/** Composite hook for the Find friends screen: access, the lookup, the found list and its actions. */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { partialCheckMessage, requestsSentNotice } from "@haalkhata/shared/contacts/contactsCopy";
import {
  buildContactLookup,
  chunkContactLookup,
  lookupRegion,
} from "@haalkhata/shared/contacts/identifiers";
import {
  groupFoundPeople,
  mergeFoundContacts,
  withRelation,
  type FoundPerson,
} from "@haalkhata/shared/contacts/matches";
import { authClient, errorMessage } from "@/lib/api/connect";
import { shareProfileInvite } from "@/lib/invite/share";
import { deviceLocaleTag } from "../../../utils/deviceLocale";
import { useContactsAccess } from "./useContactsAccess";
import { useFindFriendsAPI } from "./useFindFriendsAPI";

/** Where the lookup is. */
export type LookupStatus = "idle" | "reading" | "matching" | "done";

/**
 * Drives the Find friends screen. Once contacts may be read, the address
 * book is read, reduced to identifiers and matched, once per visit (and
 * again only when the person asks, since every lookup spends the day's
 * allowance). Found people live in this screen's state alone and are gone
 * when it closes; the contact names never leave the device.
 *
 * @returns The caller, contacts access and its actions, the lookup status
 *   and outcome, the found people grouped by action, and the actions on
 *   them (add, accept, send to all with its confirm sheet, share a link).
 */
export function useFindFriends() {
  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const contacts = useContactsAccess();
  const findFriendsAPI = useFindFriendsAPI();

  const [status, setStatus] = useState<LookupStatus>("idle");
  const [contactCount, setContactCount] = useState(0);
  const [people, setPeople] = useState<FoundPerson[]>([]);
  const [lookupFailure, setLookupFailure] = useState<unknown>(null);
  const [partialNote, setPartialNote] = useState("");
  const [notice, setNotice] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [sendAllError, setSendAllError] = useState("");

  const profile = currentUser.data;
  const readable = contacts.access === "all" || contacts.access === "limited";

  /** Reads the address book and matches it; every outcome ends on screen. */
  const lookUpContacts = useCallback(async () => {
    if (!profile) return;
    setLookupFailure(null);
    setPartialNote("");
    setNotice("");
    setStatus("reading");
    try {
      const addressBook = await contacts.readAll();
      setContactCount(addressBook.length);
      const lookup = buildContactLookup(addressBook, {
        region: lookupRegion(profile.phone, deviceLocaleTag()),
        ownIdentifiers: [profile.phone, profile.email],
      });
      setStatus("matching");
      const outcome = await findFriendsAPI.lookUp.mutateAsync(chunkContactLookup(lookup));
      setPeople(mergeFoundContacts(outcome.found, lookup));
      if (outcome.stoppedEarly) {
        setPartialNote(outcome.failure || partialCheckMessage(outcome.checked, outcome.total));
      }
    } catch (failure) {
      setLookupFailure(failure);
    } finally {
      setStatus("done");
    }
  }, [findFriendsAPI.lookUp, contacts, profile]);

  // One lookup per visit, started as soon as contacts may be read: on
  // arrival when access was already granted, or right after the prompt.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!readable || !profile || startedRef.current) return;
    startedRef.current = true;
    void lookUpContacts();
  }, [readable, profile, lookUpContacts]);

  /**
   * Runs one action for one row, marking the row busy and reporting a failure.
   *
   * @param userId - The row's account.
   * @param action - What to do.
   */
  const forRow = async (userId: string, action: () => Promise<void>) => {
    setActionError("");
    setBusyIds((current) => [...current, userId]);
    try {
      await action();
    } catch (failure) {
      setActionError(errorMessage(failure));
    } finally {
      setBusyIds((current) => current.filter((busyId) => busyId !== userId));
    }
  };

  /**
   * Sends one request from its row.
   *
   * @param userId - The account to ask.
   */
  const addPerson = (userId: string) =>
    forRow(userId, async () => {
      const outcome = await findFriendsAPI.send.mutateAsync([userId]);
      setPeople((current) => withRelation(current, outcome.sent, ContactRelation.REQUESTED));
    });

  /**
   * Accepts a request someone found here already sent the caller.
   *
   * @param userId - The account whose request to accept.
   */
  const accept = (userId: string) =>
    forRow(userId, async () => {
      await findFriendsAPI.accept.mutateAsync(userId);
      setPeople((current) => withRelation(current, [userId], ContactRelation.FRIEND));
    });

  const groups = groupFoundPeople(people);

  /** Sends to everyone not yet asked, from the confirm sheet that lists them. */
  const sendAll = async () => {
    setSendAllError("");
    try {
      const outcome = await findFriendsAPI.send.mutateAsync(groups.requestable.map((person) => person.user.id));
      setPeople((current) => withRelation(current, outcome.sent, ContactRelation.REQUESTED));
      if (outcome.failure) {
        setSendAllError(outcome.failure);
        return;
      }
      setConfirmingAll(false);
      setNotice(requestsSentNotice(outcome.sent.length));
    } catch (failure) {
      setSendAllError(errorMessage(failure));
    }
  };

  /** Shares the caller's own "add me" link, for contacts not on HaalKhata yet. */
  const shareInviteLink = async () => {
    setActionError("");
    try {
      const { token } = await findFriendsAPI.profileLink.mutateAsync();
      await shareProfileInvite(token, profile?.name ?? "");
    } catch (failure) {
      setActionError(errorMessage(failure));
    }
  };

  /** Lets iOS 18 limited access cover more contacts, then matches again. */
  const chooseMore = async () => {
    if (await contacts.chooseMore()) await lookUpContacts();
  };

  return {
    me: profile,
    meFailure: currentUser.data ? null : currentUser.error,
    retryMe: currentUser.refetch,
    access: contacts.access,
    checkingAccess: contacts.checking,
    accessError: contacts.error,
    allow: contacts.request,
    openSettings: contacts.openSettings,
    chooseMore,
    status,
    contactCount,
    lookupFailure,
    retry: lookUpContacts,
    partialNote,
    notice,
    groups,
    found: people.length,
    busyIds,
    add: addPerson,
    accept,
    actionError,
    confirmingAll,
    openSendAll: () => {
      setSendAllError("");
      setConfirmingAll(true);
    },
    closeSendAll: () => setConfirmingAll(false),
    sendAll,
    sendingAll: findFriendsAPI.send.isPending && confirmingAll,
    sendAllError,
    shareInviteLink,
    sharingLink: findFriendsAPI.profileLink.isPending,
  };
}

/** The Find friends screen's controller. */
export type FindFriendsController = ReturnType<typeof useFindFriends>;
