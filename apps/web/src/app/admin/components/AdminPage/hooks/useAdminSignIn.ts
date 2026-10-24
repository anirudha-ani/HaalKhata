"use client";
/** Loads Google Identity Services and trades its ID token for an admin session. */

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminAnalyticsClient, errorMessage } from "@/lib/api/connect";
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
 * wrong one would fail a second time for a reason nobody could see.
 *
 * @param options - Hook options.
 * @param options.googleClientId - The OAuth client id to render the button
 *   for, as the server reported it; "" when sign-in is not configured.
 * @param options.onSignedIn - Called once the admin session cookie is set.
 * @returns `setButtonElement` to pass as a callback ref on an empty div, the
 *   last `error` message, `isPending` while the token is being exchanged, and
 *   `isConfigured` for whether the button will appear at all.
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

    Promise.all([loadGoogleScript(), adminAnalyticsClient.beginSignIn({})])
      .then(([_scriptReady, challenge]) => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          nonce: challenge.nonce,
          callback: (response) => {
            setError("");
            mutate(response.credential);
          },
        });
        window.google.accounts.id.renderButton(buttonElement, GOOGLE_BUTTON_OPTIONS);
      })
      .catch((setupError) => {
        if (!cancelled) setError(`Could not start Google sign-in: ${errorMessage(setupError)}`);
      });

    return () => {
      cancelled = true;
    };
    // `mutate` is referentially stable in React Query; `attempt` is here on
    // purpose, to redo the setup with a fresh nonce after a failure.
  }, [isConfigured, googleClientId, buttonElement, mutate, attempt]);

  return { setButtonElement, error, isPending, isConfigured };
}
