"use client";
/** Admin sign-in: the Google button that starts an operator session. */

import { ShieldCheck } from "lucide-react";
import { EMPTY_ALLOWLIST_NOTE } from "../../constants/adminPage";
import { useAdminSignIn } from "../../hooks/useAdminSignIn";

/**
 * Renders the admin page's signed-out state: what the page is, who it is
 * for, and Google's sign-in button. A refusal is shown directly under the
 * button that caused it. When the server's allowlist is empty there is no
 * button: the card says the allowlist is empty instead, because every
 * sign-in would be refused.
 *
 * @param props - Component props.
 * @returns The sign-in card.
 */
export function AdminSignIn({
  googleClientId,
  allowlistConfigured,
  onSignedIn,
  sessionEnded,
}: {
  /** The OAuth client id Google's button is rendered for; "" when unconfigured. */
  googleClientId: string;
  /** Whether the server's allowlist names anyone. When not, no button is offered. */
  allowlistConfigured: boolean;
  /** Called once the admin session cookie is set. */
  onSignedIn: () => void;
  /** Whether the operator was signed in a moment ago and no longer is. */
  sessionEnded: boolean;
}) {
  // Destructured, not kept as one object: `setButtonElement` is handed to a
  // `ref`, and reading sibling fields off the same object would look to the
  // compiler like reading a ref during render.
  // With nobody on the allowlist there is no button to set up, so Google's
  // script is never loaded for a sign-in that could only be refused.
  const { setButtonElement, error, isPending, isConfigured } = useAdminSignIn({
    googleClientId: allowlistConfigured ? googleClientId : "",
    onSignedIn,
  });

  return (
    <div className="mx-auto mt-[12vh] max-w-sm rounded-2xl border border-line bg-card p-6 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-brand-600" aria-hidden="true" />
      <h1 className="mt-3 text-2xl font-bold">HaalKhata admin</h1>
      <p className="mt-2 text-sm text-ink-soft">
        For the operator of this server. Sign in with a Google account on the admin allowlist.
      </p>

      {sessionEnded ? (
        <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft" role="status">
          You are signed out.
        </p>
      ) : null}

      <div className="mt-5 flex min-h-11 justify-center">
        {!allowlistConfigured ? (
          <p className="text-sm text-ink-soft">{EMPTY_ALLOWLIST_NOTE}</p>
        ) : isConfigured ? (
          <div ref={setButtonElement} />
        ) : (
          <p className="text-sm text-ink-soft">Google sign-in is not configured on this server.</p>
        )}
      </div>

      {isPending ? (
        <p className="mt-3 text-sm text-ink-soft" role="status">
          Checking that account…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-neg-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
