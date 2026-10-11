/** Constants for the admin usage page. */

/** Which weekly series the trend chart is showing. */
export type TrendMetric = "expenses" | "users" | "payments" | "scans";

/** The trend chart's series, in the order its switch shows them. */
export const TREND_METRICS: readonly {
  value: TrendMetric;
  label: string;
  /** What one of the thing is called, for the readout. */
  singular: string;
  /** What several are called; "people" is not "persons". */
  plural: string;
}[] = [
  { value: "expenses", label: "Expenses", singular: "expense", plural: "expenses" },
  { value: "users", label: "New people", singular: "new person", plural: "new people" },
  { value: "payments", label: "Payments", singular: "payment", plural: "payments" },
  { value: "scans", label: "Scans", singular: "receipt scan", plural: "receipt scans" },
];

/** The series the trend opens on: expenses are what the product is for. */
export const DEFAULT_TREND_METRIC: TrendMetric = "expenses";

/** Filter value meaning "every split type". */
export const ALL_SPLIT_TYPES = "all";

/** Every split type the product has, in the order the expense form offers them. */
export const SPLIT_TYPE_ORDER = ["equal", "exact", "percent", "shares", "itemized"] as const;

/** A column the people table can be ordered by. */
export type PeopleSortKey = "name" | "joined" | "expenses" | "payments" | "scans";

/** Which way a column is ordered. */
export type SortDirection = "ascending" | "descending";

/** The order the people table opens in: newest first, as the server sends it. */
export const DEFAULT_PEOPLE_SORT: { key: PeopleSortKey; direction: SortDirection } = {
  key: "joined",
  direction: "descending",
};
