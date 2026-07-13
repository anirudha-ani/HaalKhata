/**
 * HaalKhata design tokens — the web app's "fresh ledger" theme as React
 * Native constants. হালখাতা is the Bengali tradition of opening a new ledger
 * book: red covers, cream paper. Vermillion is the brand accent; money
 * semantics use emerald (owed to you) and burnt amber (you owe).
 */

import { Platform } from "react-native";

/** Theme colors, mirroring the CSS custom properties in the web app's globals.css. */
export const colors = {
  paper: "#faf6ef",
  card: "#fffdf9",
  ink: "#292217",
  inkSoft: "#857a68",
  line: "#eae1d1",

  brand50: "#fdf1ee",
  brand100: "#fadfd8",
  brand200: "#f2b9ac",
  brand500: "#c74a33",
  brand600: "#b03a25",
  brand700: "#92301f",
  brand800: "#6f2517",

  pos50: "#ebf7f1",
  pos600: "#0e7f58",
  pos700: "#0b6647",

  neg50: "#fbf3e7",
  neg600: "#b45309",
  neg700: "#92400e",

  white: "#ffffff",
} as const;

/** Spacing scale in density-independent pixels. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Corner radii; `lg` matches the web's rounded-2xl cards. */
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

/** Font families; `display` is the serif used for headings and the wordmark. */
export const fonts = {
  display: Platform.select({ ios: "Georgia", default: "serif" }) as string,
} as const;
