/** Constants for the admin page. */

import { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";

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

/** How long one bar of the trend is, in the order its switch shows them. */
export const TREND_UNITS: readonly { value: TrendUnit; label: string }[] = [
  { value: TrendUnit.WEEK, label: "Weeks" },
  { value: TrendUnit.MONTH, label: "Months" },
];

/** The unit the trend opens on: weeks, the finer view of the recent past. */
export const DEFAULT_TREND_UNIT = TrendUnit.WEEK;

/**
 * Shown in the people table where the server withheld a display name
 * because the name was itself an email address or a phone number.
 */
export const WITHHELD_NAME_LABEL = "Name hidden";

/** Filter value meaning "every split type". */
export const ALL_SPLIT_TYPES = "all";

/** Every split type the product has, in the order the expense form offers them. */
export const SPLIT_TYPE_ORDER = ["equal", "exact", "percent", "shares", "itemized"] as const;

/**
 * How the usage page words each split type: `name` where it stands alone (a
 * filter, a list row), `phrase` where it finishes "12 expenses ...".
 */
export const SPLIT_TYPE_WORDING: Record<string, { name: string; phrase: string }> = {
  equal: { name: "Equal", phrase: "split equally" },
  exact: { name: "Exact amounts", phrase: "split by exact amounts" },
  percent: { name: "Percent", phrase: "split by percent" },
  shares: { name: "Shares", phrase: "split by shares" },
  itemized: { name: "Itemized", phrase: "split by item" },
};

/** A column the people table can be ordered by. */
export type PeopleSortKey = "name" | "joined" | "expenses" | "payments" | "scans";

/** Which way a column is ordered. */
export type SortDirection = "ascending" | "descending";

/** The order the people table opens in: newest first, as the server sends it. */
export const DEFAULT_PEOPLE_SORT: { key: PeopleSortKey; direction: SortDirection } = {
  key: "joined",
  direction: "descending",
};

/**
 * Shown on the sign-in card instead of Google's button when the server's
 * allowlist is empty: every sign-in would be refused, so the page says why
 * before anyone goes through Google to find out.
 */
export const EMPTY_ALLOWLIST_NOTE =
  "No Google account can sign in here yet. Add yours to ADMIN_EMAILS on the server, then restart it.";

/** Which half of the admin page is showing: the usage overview or the report queue. */
export type AdminView = "usage" | "reports";

/** The view the page opens on. Usage is what the page is for most days. */
export const DEFAULT_ADMIN_VIEW: AdminView = "usage";
