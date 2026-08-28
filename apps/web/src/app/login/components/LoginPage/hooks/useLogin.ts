"use client";
/** Login/signup form state and the auth mutation for the login route. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { splitIdentifier } from "@haalkhata/shared/auth/identifier";
import { authClient, errorMessage } from "@/lib/api/connect";
import { clearAccountQueryCache } from "@/lib/api/queryCache";

/** Which form the login page is showing: sign in or create account. */
export type LoginMode = "login" | "signup";

/**
 * Manages the login page: the login/signup mode toggle, the credentials form
 * fields, and the mutation that signs in (or signs up) and then navigates to
 * the dashboard. The identifier field accepts either an email or a phone
 * number; the server looks the account up by whichever was supplied.
 *
 * @returns An object with the current `mode` and `switchMode`, the
 *   `identifier`/`name`/`password` fields with setters, the last auth `error`
 *   message, `submit` to run the mutation, and `isPending` while in flight.
 */
export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<LoginMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /** Signs in or signs up depending on mode; on success goes to the dashboard. */
  const mutation = useMutation({
    mutationFn: () => {
      const { email, phone } = splitIdentifier(identifier);
      return mode === "login"
        ? authClient.logIn({ email, phone, password })
        : authClient.signUp({ email, phone, name, password });
    },
    onSuccess: () => {
      clearAccountQueryCache(queryClient);
      router.push("/dashboard");
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
