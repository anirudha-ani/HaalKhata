/** Device-specific opt-in for Duo's native side navigation; window size is not device identity. */

import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/** Stable through folding and rotation, and false for every other iPhone, iPad and Android device. */
export const IS_IPHONE_DUO = Platform.OS === "ios"
  && requireOptionalNativeModule<{ isDuo?: boolean }>("HaalKhataFold")?.isDuo === true;
