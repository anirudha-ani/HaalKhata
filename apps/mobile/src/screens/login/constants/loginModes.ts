/** Login-route constants: mode toggle entries. */

import type { LoginMode } from "../components/LoginScreen/hooks/useLogin";

/** Mode toggle entries for the sign-in/create-account switcher. */
export const LOGIN_MODES: { value: LoginMode; label: string }[] = [
  { value: "login", label: "Sign in" },
  { value: "signup", label: "Create account" },
];
