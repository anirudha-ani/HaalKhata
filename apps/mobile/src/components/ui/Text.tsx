/** Native text that remeasures after iOS Dynamic Type changes without remounting forms. */

import type { ComponentPropsWithRef } from "react";
import { Platform, Text as NativeText, useWindowDimensions } from "react-native";

/**
 * Recreates only the text host when iOS changes its font scale. Fabric in
 * React Native 0.86 can otherwise paint larger glyphs into stale line boxes
 * (https://github.com/react/react-native/issues/57512). Screen state and sibling
 * inputs keep their identity, focus and draft. Native scaling, nested text,
 * accessibility props and caller-specified scaling limits remain native.
 *
 * @param props - Standard React Native text props, including a forwarded ref.
 * @returns A native text host with a fresh measurement at the current scale.
 */
export function Text(props: ComponentPropsWithRef<typeof NativeText>) {
  const { fontScale } = useWindowDimensions();
  const measurementKey = Platform.OS === "ios" && props.allowFontScaling !== false
    ? fontScale
    : "stable";
  return <NativeText key={measurementKey} {...props} />;
}
