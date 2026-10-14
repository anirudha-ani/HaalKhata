"use client";
/** Verifier-bound Apple browser login; the callback URL never carries a session. */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient, errorMessage } from "@/lib/api/connect";
import { completeBrowserSignIn } from "@/lib/auth/completeSignIn";
import { APPLE_VERIFIER_STORAGE_KEY } from "../../../constants/appleSignIn";
import { assertAppleBrowserOrigin } from "../utils/appleBrowserOrigin";
import { useSignInOptionsAPI } from "./useSignInOptionsAPI";

/**
 * Starts Apple authorization and redeems the callback with this tab's private proof.
 * @returns Configuration availability, pending/error state and sign-in action.
 */
export function useAppleSignIn() {
  const queryClient = useQueryClient();
  const options = useSignInOptionsAPI();
  const available = options.isSuccess && options.data.appleBrowserEnabled;
  const attempted = useRef(false);
  const [error, setError] = useState("");
  const complete = useMutation({
    mutationFn: async (input: { state: string; verifier: string; callbackError?: string | null }) => {
      if (input.callbackError || !input.verifier) throw new Error("Apple sign-in could not finish. Please try again.");
      return authClient.completeAppleSignIn(input);
    },
    onSuccess: () => completeBrowserSignIn(queryClient),
    onError: (failure) => setError(errorMessage(failure)),
  });
  const redeem = complete.mutate;
  useEffect(() => {
    const callback = new URL(window.location.href);
    const state = callback.searchParams.get("apple_sign_in");
    if (!state || attempted.current) return;
    attempted.current = true;
    const verifier = sessionStorage.getItem(APPLE_VERIFIER_STORAGE_KEY) ?? "";
    sessionStorage.removeItem(APPLE_VERIFIER_STORAGE_KEY);
    const callbackError = callback.searchParams.get("apple_error");
    callback.searchParams.delete("apple_sign_in"); callback.searchParams.delete("apple_error");
    window.history.replaceState(null, "", callback.href);
    if (callbackError === "cancelled") return;
    redeem({ state, verifier, callbackError });
  }, [redeem]);
  const begin = useMutation({
    mutationFn: async () => {
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      const verifier = btoa(String.fromCharCode(...randomBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const hashed = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      const verifierHash = Array.from(hashed, (value) => value.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(APPLE_VERIFIER_STORAGE_KEY, verifier);
      const challenge = await authClient.beginAppleSignIn({ browserFlow: true, verifierHash });
      assertAppleBrowserOrigin(challenge.authorizationUrl, window.location.origin);
      return challenge;
    },
    onSuccess: (challenge) => window.location.assign(challenge.authorizationUrl),
    onError: (failure) => { sessionStorage.removeItem(APPLE_VERIFIER_STORAGE_KEY); setError(errorMessage(failure)); },
  });
  return { available, error, isLoading: options.isPending, isPending: begin.isPending || complete.isPending,
    /** Clears a prior error and starts browser authorization. */
    signIn: () => { if (available && !begin.isPending && !complete.isPending) { setError(""); begin.mutate(); } } };
}
