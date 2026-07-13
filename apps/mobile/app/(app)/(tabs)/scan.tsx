/** /scan route: renders ScanScreen (reads the optional ?group param itself). */

import { ScanScreen } from "@/screens/scan/components/ScanScreen/ScanScreen";

/**
 * Renders the scan route by mounting the ScanScreen orchestrator.
 *
 * @returns The /scan screen.
 */
export default function Scan() {
  return <ScanScreen />;
}
