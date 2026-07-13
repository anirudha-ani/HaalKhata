"use client";
/** Login/signup form state and the auth mutation for the login route. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { authClient, errorMessage } from "@/lib/api/connect";

/** Which form the login page is showing: sign in or create account. */
export type LoginMode = "login" | "signup";

/**
 * Manages the login page: the login/signup mode toggle, the credentials form
 * fields, and the mutation that signs in (or signs up) and then navigates to
 * the dashboard.
 *
 * @returns An object with the current `mode` and `switchMode`, the `email`/
 *   `name`/`password` fields with setters, the last auth `error` message,
 *   `submit` to run the mutation, and `isPending` while it is in flight.
 */
export function useLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /** Signs in or signs up depending on mode; on success goes to the dashboard. */
  const mutation = useMutation({
    mutationFn: () =>
      mode === "login"
        ? authClient.logIn({ email, password })
        : authClient.signUp({ email, name, password }),
    onSuccess: () => router.push("/dashboard"),
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
    email,
    setEmail,
    name,
    setName,
    password,
    setPassword,
    error,
    submit,
    isPending: mutation.isPending,
  };
}
