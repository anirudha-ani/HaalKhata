"use client";
/** Loads Google Identity Services and trades its ID token for a session. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient, errorMessage } from "@/lib/api/connect";
import { nextPathFromLocation } from "@/lib/navigation/nextPath";
import { clearAccountQueryCache } from "@/lib/api/queryCache";
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
 *   `isConfigured` for whether the button will appear at all.
 */
export function useGoogleSignIn() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // The host element is held in state rather than a ref so the effect below
  // runs exactly when the div mounts, with no ordering dance against the
  // script load.
  const [buttonElement, setButtonElement] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const isConfigured = GOOGLE_CLIENT_ID.length > 0;

  const { mutate, isPending } = useMutation({
    mutationFn: (idToken: string) => authClient.logInWithGoogle({ idToken }),
    onSuccess: () => {
      clearAccountQueryCache(queryClient);
      router.push(nextPathFromLocation());
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  useEffect(() => {
    if (!isConfigured || !buttonElement) return;
    let cancelled = false;

    Promise.all([loadGoogleScript(), authClient.beginGoogleSignIn({})])
      .then(([_scriptReady, challenge]) => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: challenge.nonce,
          callback: (response) => {
            setError("");
            mutate(response.credential);
          },
        });
        window.google.accounts.id.renderButton(buttonElement, GOOGLE_BUTTON_OPTIONS);
      })
      .catch(() => {
        if (!cancelled) setError("could not start Google sign-in, please try again");
      });

    return () => {
      cancelled = true;
    };
    // `mutate` is referentially stable in React Query, so this runs once per
    // mounted host element rather than on every mutation state change.
  }, [isConfigured, buttonElement, mutate]);

  return { setButtonElement, error, isPending, isConfigured };
}
