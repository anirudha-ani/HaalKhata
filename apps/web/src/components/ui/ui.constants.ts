/** Shared presentational-UI constants used by components in this folder. */

/** Tailwind size classes for each avatar size variant. */
export const AVATAR_SIZES = {
  xsmall: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

/** How long an error popup stays on screen before dismissing itself, in milliseconds. */
export const ERROR_POPUP_AUTO_DISMISS_MS = 8000;
