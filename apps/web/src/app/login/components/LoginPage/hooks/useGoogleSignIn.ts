"use client";
/** Loads Google Identity Services and trades its ID token for a session. */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient, errorMessage } from "@/lib/api/connect";
import { completeBrowserSignIn } from "@/lib/auth/completeSignIn";
import { GOOGLE_BUTTON_OPTIONS, GOOGLE_CLIENT_ID } from "@/app/login/constants/googleSignIn";
import { loadGoogleScript } from "../utils/loadGoogleScript";

/**
 * Renders Google's sign-in button and exchanges the ID token it produces for a
 * HaalKhata session, then navigates to the dashboard.
 *
 * Google draws its own button into whatever element `setButtonElement` is given,
 * so its branding requirements are met without restyling anything. When the
 * client id is unset — a deploy that has not been configured yet — nothing is
 * rendered rather than showing a control that cannot work.
 *
 * @returns `setButtonElement` to pass as a callback ref on an empty div, the
 *   last `error` message, `isPending` while the token is being exchanged, and
 *   `isConfigured`, `isLoading`, and `retry` for recoverable startup failures.
 */
export function useGoogleSignIn() {
  const queryClient = useQueryClient();
  // The host element is held in state rather than a ref so the effect below
  // runs exactly when the div mounts, with no ordering dance against the
  // script load.
  const [buttonElement, setButtonElement] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const isConfigured = GOOGLE_CLIENT_ID.length > 0;

  const { mutate, isPending } = useMutation({
    mutationFn: (idToken: string) => authClient.logInWithGoogle({ idToken }),
    onSuccess: () => completeBrowserSignIn(queryClient),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  useEffect(() => {
    if (!isConfigured || !buttonElement) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    Promise.all([loadGoogleScript(), authClient.beginGoogleSignIn({})])
      .then(([_scriptReady, challenge]) => {
        if (cancelled) return;
        if (!window.google) throw new Error("Google sign-in did not load");
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: challenge.nonce,
          callback: (response) => {
            setError("");
            mutate(response.credential);
          },
        });
        /** Renders Google's button at the card width, including when a mobile sheet opens. */
        const renderButton = () => {
          const width = Math.min(400, Math.floor(buttonElement.clientWidth));
          if (!width) return;
          buttonElement.replaceChildren();
          window.google?.accounts.id.renderButton(buttonElement, { ...GOOGLE_BUTTON_OPTIONS, width });
        };
        renderButton();
        resizeObserver = new ResizeObserver(renderButton);
        resizeObserver.observe(buttonElement);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
          setError("Google sign-in couldn’t load. Please try again.");
        }
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
    // `mutate` is referentially stable in React Query, so this runs once per
    // mounted host element rather than on every mutation state change.
  }, [isConfigured, buttonElement, mutate, attempt]);

  return {
    setButtonElement, error, isPending, isConfigured, isLoading,
    /** Retries provider initialization with a fresh server-issued nonce. */
    retry: () => {
      buttonElement?.replaceChildren();
      setError("");
      setIsLoading(true);
      setAttempt((previous) => previous + 1);
    },
  };
}
