/** /dashboard route: renders DashboardScreen. */

import { DashboardScreen } from "@/screens/dashboard/components/DashboardScreen/DashboardScreen";

/**
 * Renders the dashboard route by mounting the DashboardScreen orchestrator.
 *
 * @returns The /dashboard screen.
 */
export default function Dashboard() {
  return <DashboardScreen />;
}
