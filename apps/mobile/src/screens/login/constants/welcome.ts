/** Sample ledger content and sizes for the welcome screen's step illustrations. */

import { colors } from "@/lib/theme/theme";

/** A person in the sample trip, in the shape the Avatar component draws. */
export interface SamplePerson {
  id: string;
  /** Full name; the avatar shows its initials. */
  name: string;
  /** What the illustrations call them. */
  firstName: string;
  avatarColor: string;
  avatarUrl: string;
}

/** The four friends every illustration shows, matching the web's sample ledger. */
export const SAMPLE_PEOPLE: readonly SamplePerson[] = [
  { id: "sample-oni", name: "Oni Nakamura", firstName: "Oni", avatarColor: colors.brand600, avatarUrl: "" },
  { id: "sample-dot", name: "Dot Okafor", firstName: "Dot", avatarColor: colors.pos600, avatarUrl: "" },
  { id: "sample-pz", name: "Pat Zhou", firstName: "PZ", avatarColor: colors.neg600, avatarUrl: "" },
  { id: "sample-jess", name: "Jess Evans", firstName: "Jess", avatarColor: colors.ink, avatarUrl: "" },
];

/** Lines on the receipt being scanned in "Snap it". */
export const SAMPLE_RECEIPT_LINES = [
  { label: "Trail snacks", amount: "$24.00" },
  { label: "Picnic supplies", amount: "$52.00" },
  { label: "Firewood", amount: "$32.00" },
  { label: "Tax", amount: "$12.00" },
] as const;

/** The receipt's total and the stamp that lands once it is read. */
export const SAMPLE_RECEIPT = { total: "$120.00", stamp: "3 ITEMS FOUND" } as const;

/** The bill being split in "Split it". */
export const SAMPLE_SPLIT_BILL = { title: "Dinner at Nando's", total: "$96.00" } as const;

/** Items assigned to people in "Split it"; `people` index SAMPLE_PEOPLE. */
export const SAMPLE_SPLIT_ITEMS = [
  { label: "Peri-peri platter", amount: "$48.00", people: [0, 1] },
  { label: "Wings", amount: "$24.00", people: [2] },
  { label: "Halloumi fries", amount: "$24.00", people: [0, 1, 2, 3] },
] as const;

/** What each person owes once every item is assigned, in SAMPLE_PEOPLE order. */
export const SAMPLE_SPLIT_TOTALS = ["$30.00", "$30.00", "$30.00", "$6.00"] as const;

/** The balance cleared in "Clear it". */
export const SAMPLE_SETTLEMENT = {
  amount: "$15.00",
  before: "Dot owes Oni $15.00",
  after: "All square",
  apps: ["Venmo", "Cash App", "PayPal"],
} as const;

/** Width of the receipt card in "Snap it". */
export const RECEIPT_WIDTH = 196;

/** Height the scan line travels over the receipt. */
export const RECEIPT_SCAN_HEIGHT = 150;

/** Width of the line in "Clear it" that the amount travels along, between the two people. */
export const SETTLE_TRACK_WIDTH = 132;

/** Height of the illustration area on a phone. */
export const ILLUSTRATION_HEIGHT = 228;

/** Height of the illustration area on an iPad. */
export const TABLET_ILLUSTRATION_HEIGHT = 320;

/** How far an illustration lags its page while swiping, as a share of the page width. */
export const ILLUSTRATION_PARALLAX = 0.28;

/** Width of the current page's dot; the others are drawn as circles. */
export const PAGE_DOT_ACTIVE_WIDTH = 22;

/** Diameter of a page dot. */
export const PAGE_DOT_SIZE = 8;

/** Largest the welcome content grows on an iPad before it is centered. */
export const WELCOME_TABLET_MAX_WIDTH = 1080;
