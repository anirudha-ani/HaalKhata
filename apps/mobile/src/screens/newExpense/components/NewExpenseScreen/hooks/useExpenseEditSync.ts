/** Keeps an open edit form up to date with what other people save: takes in their changes, and holds the ones that collide. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Code, ConnectError } from "@connectrpc/connect";
import type { Expense } from "@haalkhata/shared/api/plainMessages";
import { describeEditConflict } from "@haalkhata/shared/expense/merge/describeEdit";
import { catchUpForm, editPartKey, takeTheirs } from "@haalkhata/shared/expense/merge/editDraft";
import { expenseStateOf, type ExpenseState } from "@haalkhata/shared/expense/merge/expenseState";
import type { EditConflict, EditPart } from "@haalkhata/shared/expense/merge/mergeExpenseEdit";

/** What to take into the form: which parts, with their new values in `merged` and `latest`. */
export interface TakenChanges {
  parts: ReadonlySet<EditPart["part"]>;
  merged: ExpenseState;
  latest: Expense;
}

/** What the sync needs from the form. */
interface EditSyncOptions {
  /** The expense as the form opened it; undefined when creating. */
  opened: Expense | undefined;
  /** What the server last said the expense's version is. */
  savedVersion: number | undefined;
  /** When it last said so, so a failed catch-up is tried again on the next look. */
  versionCheckedAt: number;
  /** Who is editing. */
  myId: string;
  /** Whether a save is on its way: a catch-up waits for it. */
  isSaving: boolean;
  /** The expense's currency. */
  currency: string;
  /**
   * Reads the expense as it is saved now.
   *
   * @returns The expense and the people it names.
   */
  readLatest: () => Promise<{ expense?: Expense; users: readonly { id: string; name: string }[] }>;
  /**
   * Reads the form as it stands.
   *
   * @returns Its state.
   */
  readForm: () => ExpenseState;
  /**
   * Puts changes into the form.
   *
   * @param taken - What to take.
   */
  takeIn: (taken: TakenChanges) => void;
}

/**
 * Watches an expense while its edit form is open. When somebody saves, the
 * parts this person has not touched are taken into the form, with a note
 * saying whose change it was; a part both changed waits for their answer, and
 * the form cannot be saved until it has one.
 *
 * @param options - The form and how to reach the server.
 * @returns `base` (what a save is measured against), the `note`, the
 *   `conflicts` with their wording, and how to answer them.
 */
export function useExpenseEditSync(options: EditSyncOptions) {
  const { opened, savedVersion, versionCheckedAt, isSaving } = options;
  const [base, setBase] = useState(opened);
  const [note, setNote] = useState("");
  const [conflicts, setConflicts] = useState<EditConflict[]>([]);
  const [changedBy, setChangedBy] = useState("Someone");
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const latestOptions = useRef(options);
  useEffect(() => {
    latestOptions.current = options;
  });
  const baseRef = useRef(opened);
  const latestRef = useRef<Expense | undefined>(opened);
  const conflictsRef = useRef<EditConflict[]>([]);

  /** Reads the expense as saved, takes in what can be taken and holds what collides. */
  const catchUp = useCallback(async () => {
    const current = latestOptions.current;
    const startedFrom = baseRef.current;
    if (!startedFrom) return;
    const response = await current.readLatest();
    const latest = response.expense;
    if (!latest || baseRef.current !== startedFrom) return;
    const latestNames = new Map(response.users.map((user) => [user.id, user.name]));
    const editor = latestNames.get(latest.updatedBy)?.split(" ")[0] ?? "Someone";
    const caughtUp = catchUpForm({
      base: startedFrom,
      form: current.readForm(),
      latest,
      who: editor,
      byMe: latest.updatedBy === current.myId,
      held: conflictsRef.current,
    });
    baseRef.current = latest;
    latestRef.current = latest;
    conflictsRef.current = caughtUp.conflicts;
    setBase(latest);
    setNames(latestNames);
    setChangedBy(editor);
    setNote(caughtUp.note);
    setConflicts(caughtUp.conflicts);
    if (caughtUp.parts.size > 0) current.takeIn({ parts: caughtUp.parts, merged: caughtUp.merged, latest });
  }, []);

  useEffect(() => {
    if (savedVersion === undefined || isSaving) return;
    if (savedVersion <= (baseRef.current?.version ?? savedVersion)) return;
    // Only a look at the server, in the background: the next one tries again.
    void catchUp().catch(() => undefined);
  }, [savedVersion, versionCheckedAt, isSaving, catchUp]);

  /**
   * Whether a failed save means somebody else changed the same thing. If so
   * it reads the latest, which puts the choice on screen.
   *
   * @param failure - What the save answered.
   * @returns True when the form is now showing it, so no error is needed.
   */
  const answerRefusedSave = async (failure: unknown) => {
    if (!(failure instanceof ConnectError) || failure.code !== Code.Aborted) return false;
    await catchUp();
    return true;
  };

  /**
   * Answers one conflict, keeping what this person has: they will save it
   * over the saved value, which is what they chose.
   *
   * @param conflict - The conflict.
   */
  const keepMine = (conflict: EditConflict) => {
    const answered = editPartKey(conflict.edit);
    conflictsRef.current = conflictsRef.current.filter((entry) => editPartKey(entry.edit) !== answered);
    setConflicts(conflictsRef.current);
  };

  /**
   * Answers one conflict with the saved value, putting it in the form.
   *
   * @param conflict - The conflict.
   */
  const takeSaved = (conflict: EditConflict) => {
    const latest = latestRef.current;
    if (latest) {
      const current = latestOptions.current;
      current.takeIn({
        parts: new Set([conflict.edit.part]),
        merged: takeTheirs(current.readForm(), expenseStateOf(latest), conflict.edit),
        latest,
      });
    }
    keepMine(conflict);
  };

  return {
    base,
    note,
    conflicts: conflicts.map((conflict) => ({
      conflict,
      key: editPartKey(conflict.edit),
      text: describeEditConflict(conflict, {
        who: changedBy,
        currency: options.currency,
        nameOf: (userId) => names.get(userId) ?? "Someone",
      }),
    })),
    changedBy,
    answerRefusedSave,
    keepMine,
    takeSaved,
  };
}
