/** Size and orientation constraints for native dialogs. */

import type { ModalProps } from "react-native";

/** Fraction of the current window height a sheet may occupy. */
export const SHEET_MAX_HEIGHT_RATIO = 0.92;

/** Minimum unscaled viewport height for a pinned header and footer plus usable form content. */
export const SHEET_PINNED_CHROME_MIN_HEIGHT = 360;

/** Match the app's supported rotations instead of Modal's portrait-only default. */
export const SHEET_ORIENTATIONS: ModalProps["supportedOrientations"] = [
  "portrait", "portrait-upside-down", "landscape-left", "landscape-right",
];
