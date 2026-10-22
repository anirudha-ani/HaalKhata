/** Size and orientation constraints for native dialogs. */

import type { ModalProps } from "react-native";

/** Fraction of the current window height a sheet may occupy. */
export const SHEET_MAX_HEIGHT_RATIO = 0.92;

/** Match the app's supported rotations instead of Modal's portrait-only default. */
export const SHEET_ORIENTATIONS: ModalProps["supportedOrientations"] = [
  "portrait", "portrait-upside-down", "landscape-left", "landscape-right",
];
