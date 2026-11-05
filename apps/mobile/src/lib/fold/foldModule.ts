/** The native reporter of where a foldable display folds (`modules/haalkhata-fold`). */

import { requireOptionalNativeModule, type NativeModule } from "expo";

/** Where the window is divided by a fold, in window points. */
export interface FoldRegion {
  /** Distance of the fold's left edge from the window's left edge. */
  x: number;
  /** Distance of the fold's top edge from the window's top edge. */
  y: number;
  /** The fold's width: narrow when it runs down the window, the window's width when across. */
  width: number;
  /** The fold's height: narrow when it runs across the window, the window's height when down. */
  height: number;
}

/** Events the native module sends. */
type FoldEvents = {
  /** The hinge reported; `fold` is where the window is divided now, or null. */
  onFoldChange: (event: { fold: FoldRegion | null }) => void;
};

/** The native module's surface. */
declare class HaalKhataFoldModule extends NativeModule<FoldEvents> {
  /** @returns Where the window is divided now, or null unless the display stands half open. */
  getFold(): Promise<FoldRegion | null>;
}

/**
 * The fold reporter, or null where there is none: on Android, and in an iOS
 * build made before the module existed. Without it every window counts as
 * unfolded, which is how the app behaved before.
 */
export const foldModule = requireOptionalNativeModule<HaalKhataFoldModule>("HaalKhataFold");
