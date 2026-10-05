"use client";
/** Verifier-bound Apple browser login; the callback URL never carries a session. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient, errorMessage } from "@/lib/api/connect";
import { clearAccountQueryCache } from "@/lib/api/queryCache";
import { nextPathFromLocation } from "@/lib/navigation/nextPath";
import { APPLE_VERIFIER_STORAGE_KEY } from "../../../constants/appleSignIn";

/**
 * Starts Apple authorization and redeems the callback with this tab's private proof.
 * @returns Pending/error state and sign-in action.
 */
export function useAppleSignIn() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const attempted = useRef(false);
  const [error, setError] = useState("");
  const complete = useMutation({
    mutationFn: async (input: { state: string; verifier: string; callbackError?: string | null }) => {
      if (input.callbackError || !input.verifier) throw new Error("Apple sign-in could not finish. Please try again.");
      return authClient.completeAppleSignIn(input);
    },
    onSuccess: () => { clearAccountQueryCache(queryClient); router.replace(nextPathFromLocation()); },
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
      return authClient.beginAppleSignIn({ browserFlow: true, verifierHash });
    },
    onSuccess: (challenge) => window.location.assign(challenge.authorizationUrl),
    onError: (failure) => { sessionStorage.removeItem(APPLE_VERIFIER_STORAGE_KEY); setError(errorMessage(failure)); },
  });
  return { error, isPending: begin.isPending || complete.isPending,
    /** Clears a prior error and starts browser authorization. */
    signIn: () => { setError(""); begin.mutate(); } };
}
