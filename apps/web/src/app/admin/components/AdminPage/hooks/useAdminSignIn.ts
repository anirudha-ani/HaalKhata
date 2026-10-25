"use client";
/** Loads Google Identity Services and trades its ID token for an admin session. */

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminAnalyticsClient } from "@/lib/api/adminConnect";
import { errorMessage } from "@/lib/api/connect";
import { GOOGLE_BUTTON_OPTIONS } from "@/lib/googleIdentity/googleIdentity.constants";
import { loadGoogleScript } from "@/lib/googleIdentity/loadGoogleScript";

/**
 * Renders Google's sign-in button and exchanges the ID token it produces for
 * an admin session.
 *
 * The same Google button as the app's sign-in, pointed at a different
 * exchange: this one creates no account, and succeeds only for an address
 * on the operator allowlist.
 *
 * A sign-in nonce is single use, so a refused attempt has spent the one the
 * button was set up with. Each failure therefore sets the button up again
 * with a fresh nonce; without that, choosing the right account after the
 * wrong one would fail a second time for a reason nobody could see. The
 * spent button is taken down as soon as that starts, so it can never be
 * pressed again; if the fresh nonce cannot be had, the card says why and
 * offers `retry` instead of leaving a button that could only fail.
 *
 * @param options - Hook options.
 * @param options.googleClientId - The OAuth client id to render the button
 *   for, as the server reported it; "" when sign-in is not configured.
 * @param options.onSignedIn - Called once the admin session cookie is set.
 * @returns `setButtonElement` to pass as a callback ref on an empty div, the
 *   last `error` message, `isPending` while the token is being exchanged,
 *   `isConfigured` for whether the button will appear at all, `setupFailed`
 *   when there is no button because setting it up failed, and `retry`.
 */
export function useAdminSignIn({
  googleClientId,
  onSignedIn,
}: {
  googleClientId: string;
  onSignedIn: () => void;
}) {
  // Held in state rather than a ref so the effect below runs exactly when
  // the div mounts, with no ordering dance against the script load.
  const [buttonElement, setButtonElement] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [setupFailed, setSetupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const isConfigured = googleClientId.length > 0;

  const { mutate, isPending } = useMutation({
    mutationFn: (idToken: string) => adminAnalyticsClient.signIn({ idToken }),
    onSuccess: onSignedIn,
    onError: (mutationError) => {
      setError(errorMessage(mutationError));
      setAttempt((previous) => previous + 1);
    },
  });

  useEffect(() => {
    if (!isConfigured || !buttonElement) return;
    let cancelled = false;
    // A button from an earlier setup holds a nonce that is spent or about to
    // be replaced; it goes before anything else happens.
    buttonElement.replaceChildren();

    Promise.all([loadGoogleScript(), adminAnalyticsClient.beginSignIn({})])
      .then(([google, challenge]) => {
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: googleClientId,
          nonce: challenge.nonce,
          callback: (response) => {
            setError("");
            mutate(response.credential);
          },
        });
        google.accounts.id.renderButton(buttonElement, GOOGLE_BUTTON_OPTIONS);
      })
      .catch((setupError) => {
        if (cancelled) return;
        setSetupFailed(true);
        setError(`Could not start Google sign-in: ${errorMessage(setupError)}`);
      });

    return () => {
      cancelled = true;
    };
    // `mutate` is referentially stable in React Query; `attempt` is here on
    // purpose, to redo the setup with a fresh nonce after a failure.
  }, [isConfigured, googleClientId, buttonElement, mutate, attempt]);

  return {
    setButtonElement,
    error,
    isPending,
    isConfigured,
    setupFailed,
    /** Sets the button up again with a fresh nonce after setting it up failed. */
    retry: () => {
      setError("");
      setSetupFailed(false);
      setAttempt((previous) => previous + 1);
    },
  };
}
