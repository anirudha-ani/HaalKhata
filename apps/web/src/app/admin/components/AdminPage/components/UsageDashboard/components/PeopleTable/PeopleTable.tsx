"use client";
/** People table: who uses the product and what each has done, by display name only. */

import type { UserUsage } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { SearchField } from "@/components/ui/SearchField/SearchField";
import { calendarDayLabel } from "@haalkhata/shared/analytics/insights";
import {
  ALL_SPLIT_TYPES,
  SPLIT_TYPE_ORDER,
  SPLIT_TYPE_WORDING,
  WITHHELD_NAME_LABEL,
  type PeopleSortKey,
  type SortDirection,
} from "../../../../constants/adminPage";
import { expenseCountOf } from "../../../../utils/expenseCountOf";
import { splitTypeName } from "../../../../utils/splitTypeName";
import { SortHeader } from "./components/SortHeader/SortHeader";

/**
 * Renders the people who have signed in, with what each has added.
 *
 * The filters sit in one row directly above the table, the only thing they
 * scope: a name search, and the split type the Expenses column counts. The
 * active type stays visibly pressed for as long as it is narrowing the
 * column, and the line under the filters says which type is being counted.
 *
 * A name and counts are all a row holds because they are all the overview
 * carries. On a narrow screen the joined date moves under the name rather
 * than scrolling sideways, and a long name wraps.
 *
 * @param props - Component props.
 * @returns The filters and the table.
 */
export function PeopleTable({
  people,
  totalPeople,
  truncated,
  searchText,
  onSearch,
  splitType,
  onSplitTypeChange,
  sort,
  onSort,
}: {
  /** The rows to show, already searched and ordered. */
  people: readonly UserUsage[];
  /** How many people the overview lists before searching. */
  totalPeople: number;
  /** Whether the overview left some people off the list. */
  truncated: boolean;
  /** The current name search. */
  searchText: string;
  /** Called with the new search text. */
  onSearch: (searchText: string) => void;
  /** The split type the Expenses column counts, or "all". */
  splitType: string;
  /** Called with the split type the operator picked. */
  onSplitTypeChange: (splitType: string) => void;
  /** The table's current ordering. */
  sort: { key: PeopleSortKey; direction: SortDirection };
  /** Called with a column's key when its heading is pressed. */
  onSort: (sortKey: PeopleSortKey) => void;
}) {
  const typeOptions = [
    { value: ALL_SPLIT_TYPES, label: "All types" },
    ...SPLIT_TYPE_ORDER.map((value) => ({ value: value as string, label: splitTypeName(value) })),
  ];
  const expensesShown = people.reduce(
    (total, person) => total + expenseCountOf(person, splitType),
    0,
  );
  // "12 expenses added" for every type, "12 expenses split equally" for one.
  const expensesPhrase = SPLIT_TYPE_WORDING[splitType]?.phrase ?? "added";

  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-xl font-semibold">People</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Display names and counts. Nothing else about a person is loaded on this page.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={searchText}
          onChange={onSearch}
          placeholder="Search by name"
          className="min-w-0 flex-1 basis-48"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Expense type">
          {typeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={splitType === option.value}
              onClick={() => onSplitTypeChange(option.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                splitType === option.value
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-line text-ink-soft hover:border-brand-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink-soft tabular-nums">
        {people.length === totalPeople
          ? `${totalPeople.toLocaleString()} people`
          : `${people.length.toLocaleString()} of ${totalPeople.toLocaleString()} people`}
        {" · "}
        {expensesShown.toLocaleString()} {expensesShown === 1 ? "expense" : "expenses"}{" "}
        {expensesPhrase}
        {truncated ? " · showing the most recent people only" : ""}
      </p>

      {people.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-8 text-center text-sm text-ink-soft">
          {totalPeople === 0 ? "Nobody has signed in yet." : "No name matches that search."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="hidden w-32 sm:table-column" />
              <col className="w-[4.5rem] sm:w-28" />
              <col className="w-[4.5rem] sm:w-28" />
              <col className="w-14 sm:w-24" />
            </colgroup>
            <thead className="border-b border-line text-xs">
              <tr>
                <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} align="left" />
                <SortHeader
                  label="Joined"
                  sortKey="joined"
                  sort={sort}
                  onSort={onSort}
                  align="left"
                  className="hidden sm:table-cell"
                />
                <SortHeader label="Expenses" sortKey="expenses" sort={sort} onSort={onSort} />
                <SortHeader label="Payments" sortKey="payments" sort={sort} onSort={onSort} />
                <SortHeader label="Scans" sortKey="scans" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((person, index) => (
                // Keyed by position: the overview carries no id for a person,
                // by design, and two people may share a name and a join date.
                // The list is replaced whole, never edited in place.
                <tr key={index}>
                  {/* Wraps rather than truncates: the name is the one thing
                      this row identifies a person by, and an ellipsis would
                      make two people with long names indistinguishable. */}
                  <th scope="row" className="py-2.5 pr-2 pl-4 text-left font-medium break-words">
                    {person.name ? (
                      <span className="block">{person.name}</span>
                    ) : (
                      // The server withholds a name that is really an email
                      // address or a phone number; say so rather than leave a gap.
                      <span className="block font-normal text-ink-soft italic">
                        {WITHHELD_NAME_LABEL}
                      </span>
                    )}
                    <span className="block text-xs font-normal text-ink-soft sm:hidden">
                      Joined {calendarDayLabel(person.joinedOn)}
                    </span>
                  </th>
                  <td className="hidden truncate px-2 py-2.5 text-ink-soft sm:table-cell">
                    {calendarDayLabel(person.joinedOn)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {expenseCountOf(person, splitType).toLocaleString()}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {person.paymentCount.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-4 pl-2 text-right tabular-nums">
                    {person.receiptScanCount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
