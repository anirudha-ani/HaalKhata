/** Login/signup form state and the auth mutation for the login screen. */

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { splitIdentifier } from "@haalkhata/shared/auth/identifier";
import { authClient, errorMessage } from "@/lib/api/connect";
import { clearMobileQueryCache } from "@/lib/api/queryCache";
import { setSessionToken } from "@/lib/api/session";

/** Which form the login screen is showing: sign in or create account. */
export type LoginMode = "login" | "signup";

/**
 * Manages the login screen: the login/signup mode toggle, the credentials
 * form fields, and the mutation that signs in (or signs up), stores the
 * returned bearer token, and navigates to the dashboard. The identifier
 * field accepts either an email or a phone number; the server looks the
 * account up by whichever was supplied.
 *
 * @returns An object with the current `mode` and `switchMode`, the
 *   `identifier`/`name`/`password` fields with setters, the last auth `error`
 *   message, `submit` to run the mutation, and `isPending` while in flight.
 */
export function useLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /** Signs in or signs up depending on mode; stores the token, then goes to the dashboard. */
  const mutation = useMutation({
    mutationFn: () => {
      const { email, phone } = splitIdentifier(identifier);
      return mode === "login"
        ? authClient.logIn({ email, phone, password })
        : authClient.signUp({ email, phone, name, password });
    },
    onSuccess: async (response) => {
      await clearMobileQueryCache();
      await setSessionToken(response.token);
      router.replace("/dashboard");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /**
   * Switches between the sign-in and create-account forms, clearing any error.
   *
   * @param next - The mode to switch to.
   */
  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError("");
  };

  /** Clears any previous error and submits the credentials. */
  const submit = () => {
    setError("");
    mutation.mutate();
  };

  return {
    mode,
    switchMode,
    identifier,
    setIdentifier,
    name,
    setName,
    password,
    setPassword,
    error,
    submit,
    isPending: mutation.isPending,
  };
}
