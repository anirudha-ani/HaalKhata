/** /scan route: renders ScanScreen (reads the optional ?group param itself) as a pushed screen. */

import { ScanScreen } from "@/screens/scan/components/ScanScreen/ScanScreen";

/**
 * Renders the scan route by mounting the ScanScreen orchestrator.
 *
 * @returns The /scan screen.
 */
export default function Scan() {
  return <ScanScreen />;
}
