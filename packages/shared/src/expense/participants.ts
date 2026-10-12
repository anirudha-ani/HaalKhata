/** Expense participant selection and cleanup shared by the web and mobile forms. */

/** The per-person fields affected when someone joins or leaves an expense. */
export interface ExpensePeopleState {
  /** Selected people; null means the whole group roster. */
  personIds: string[] | null;
  /** Split participation; null means every selected person shares the expense. */
  checked: Record<string, boolean> | null;
  /** Raw split amounts, percentages, or shares by person. */
  splitInputs: Record<string, string>;
  /** Raw amounts paid by person. */
  payerAmounts: Record<string, string>;
  /** The single payer's user id. */
  singlePayerId: string;
}

/**
 * Recovers a saved expense's cast, including people who only paid.
 * @param checked - Saved split participation, or null for a new expense.
 * @param singlePayerId - Saved single payer's id.
 * @param payerAmounts - Saved multi-payer inputs.
 * @returns The saved cast, or null to select every member for a new group expense.
 */
export function initialExpensePeopleIds(
  checked: Record<string, boolean> | null,
  singlePayerId: string,
  payerAmounts: Record<string, string>,
): string[] | null {
  if (checked === null) return null;
  return [...new Set([
    ...Object.keys(checked).filter((userId) => checked[userId]),
    singlePayerId,
    ...Object.keys(payerAmounts),
  ])];
}

/**
 * Resolves the selected cast, with the signed-in person pinned first.
 * @param currentUser - The signed-in person.
 * @param candidates - The group roster or the resolved ad-hoc people.
 * @param personIds - Selected group members, or null to include every candidate.
 * @returns Selected people in roster order, without duplicating the signed-in person.
 */
export function resolveExpensePeople<Person extends { id: string }>(
  currentUser: Person,
  candidates: Person[],
  personIds: string[] | null,
): Person[] {
  return [currentUser, ...candidates.filter((person) =>
    person.id !== currentUser.id && (personIds === null || personIds.includes(person.id)),
  )];
}

/**
 * Toggles someone on an expense and clears their stale money fields on removal.
 * @param state - Current selected people and per-person form values.
 * @param peopleIds - Resolved cast, used to materialize the default group selection.
 * @param userId - Person to add or remove.
 * @param currentUserId - Signed-in person, who stays pinned and replaces a removed payer.
 * @returns Updated selection and money fields; item assignments are cleared by each app.
 */
export function toggleExpensePerson(
  state: ExpensePeopleState,
  peopleIds: string[],
  userId: string,
  currentUserId: string,
): ExpensePeopleState {
  if (userId === currentUserId) return state;
  const selectedIds = state.personIds ?? peopleIds;
  if (!peopleIds.includes(userId)) {
    return {
      ...state,
      personIds: [...selectedIds, userId],
      checked: state.checked ? { ...state.checked, [userId]: true } : null,
    };
  }
  const { [userId]: _checked, ...checked } = state.checked ?? {};
  const { [userId]: _split, ...splitInputs } = state.splitInputs;
  const { [userId]: _paid, ...payerAmounts } = state.payerAmounts;
  return {
    personIds: selectedIds.filter((personId) => personId !== userId),
    checked: state.checked ? checked : null,
    splitInputs,
    payerAmounts,
    singlePayerId: state.singlePayerId === userId ? currentUserId : state.singlePayerId,
  };
}
