/** App entry point: installs runtime polyfills, then hands control to expo-router. */

import "./src/lib/polyfills/polyfills";
import "expo-router/entry";
