/** /login route: renders LoginScreen. */

import { LoginScreen } from "@/screens/login/components/LoginScreen/LoginScreen";

/**
 * Renders the login route by mounting the LoginScreen orchestrator.
 *
 * @returns The /login screen.
 */
export default function Login() {
  return <LoginScreen />;
}
