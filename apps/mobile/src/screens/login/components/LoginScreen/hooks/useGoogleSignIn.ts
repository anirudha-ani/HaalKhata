/** Google sign-in for mobile: a server nonce, the native OAuth flow, and the ID-token exchange. */

import { useMutation } from "@tanstack/react-query";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { authClient, errorMessage } from "@/lib/api/connect";
import { consumePendingInvite } from "@/lib/invite/consumePendingInvite";
import { clearMobileQueryCache } from "@/lib/api/queryCache";
import { setSessionToken } from "@/lib/api/session";
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_SCOPES,
  GOOGLE_SIGN_IN_CONFIGURED,
} from "../../../constants/googleSignIn";

// Lets the auth browser window close itself once Google redirects back.
WebBrowser.maybeCompleteAuthSession();

/**
 * Drives "Continue with Google" on mobile. Order matters: the server issues a
 * one-time nonce, the native OAuth request is built with it, Google copies it
 * into the ID token it mints for the code exchange, and the server accepts
 * that token exactly once — the same challenge the web client uses. A tap
 * arms the flow; the prompt opens as soon as a request carrying the fresh
 * nonce is ready.
 *
 * Only mount this hook when {@link GOOGLE_SIGN_IN_CONFIGURED} is true: the
 * provider needs this platform's client id to build a request at all.
 *
 * @returns `isConfigured`, `isPending` while a sign-in is in flight, the
 *   last `error`, and `signIn` to start one.
 */
export function useGoogleSignIn() {
  const router = useRouter();
  const [nonce, setNonce] = useState("");
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");

  const challenge = useMutation({
    mutationFn: () => authClient.beginGoogleSignIn({}),
    onSuccess: (issued) => setNonce(issued.nonce),
    onError: (mutationError) => {
      setArmed(false);
      setError(errorMessage(mutationError));
    },
  });

  // Memoized: the provider rebuilds its request whenever this object changes.
  const extraParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (nonce) params.nonce = nonce;
    return params;
  }, [nonce]);
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    scopes: GOOGLE_SCOPES,
    extraParams,
  });

  const exchange = useMutation({
    mutationFn: (idToken: string) => authClient.logInWithGoogle({ idToken }),
    onSuccess: async (result) => {
      await clearMobileQueryCache();
      await setSessionToken(result.token);
      router.replace(await consumePendingInvite());
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });
  // `mutate` is referentially stable, unlike the mutation object around it.
  const exchangeToken = exchange.mutate;

  // Prompt only once the loaded request carries the nonce the server just
  // issued: the provider rebuilds it asynchronously after `extraParams`
  // changes, so the first render after setNonce still holds the old one.
  useEffect(() => {
    if (!armed || nonce === "" || !request || request.extraParams.nonce !== nonce) return;
    setArmed(false);
    void promptAsync();
  }, [armed, nonce, request, promptAsync]);

  // The nonce is single-use whichever way the prompt ended, so forget it and
  // hand the ID token, if there is one, to the server.
  useEffect(() => {
    if (!response) return;
    setNonce("");
    if (response.type === "success") {
      const idToken = response.authentication?.idToken ?? response.params.id_token;
      if (idToken) exchangeToken(idToken);
      else setError("Google did not return an identity token");
    } else if (response.type === "error") {
      setError(response.error?.message ?? "Google sign-in failed");
    }
  }, [response, exchangeToken]);

  return {
    isConfigured: GOOGLE_SIGN_IN_CONFIGURED,
    isPending: armed || challenge.isPending || exchange.isPending,
    error,
    /** Starts a sign-in: fetch a fresh challenge, then open Google's prompt. */
    signIn: () => {
      setError("");
      setArmed(true);
      challenge.mutate();
    },
  };
}
