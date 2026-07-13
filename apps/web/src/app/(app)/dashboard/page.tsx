/** /dashboard route: renders DashboardPage. */

import { DashboardPage } from "./components/DashboardPage/DashboardPage";

/**
 * Renders the dashboard route by mounting the DashboardPage orchestrator.
 *
 * @returns The /dashboard page.
 */
export default function Dashboard() {
  return <DashboardPage />;
}
