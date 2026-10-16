/** One window subscription for native text's iOS Dynamic Type measurement workaround. */

import { createContext, useContext, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";

/** Only scale changes propagate to text consumers; window width is not context state. */
const FontScaleContext = createContext(1);

/** @param props App content. @returns Content sharing a single font-scale subscription. */
export function FontScaleProvider({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  return <FontScaleContext value={fontScale}>{children}</FontScaleContext>;
}

/** @returns Current system font scale without subscribing each Text to window dimensions. */
export function useFontScale(): number {
  return useContext(FontScaleContext);
}
