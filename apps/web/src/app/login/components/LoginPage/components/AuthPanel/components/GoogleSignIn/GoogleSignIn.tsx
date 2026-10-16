/** Google-owned sign-in button with compact loading, failure and retry feedback. */

import { RefreshCw } from "lucide-react";
import { useGoogleSignIn } from "../../../../hooks/useGoogleSignIn";

/** @returns The provider control and feedback immediately beside the action. */
export function GoogleSignIn() {
  const { setButtonElement, isLoading, isPending, error, retry } = useGoogleSignIn();

  return (
    <div className="space-y-2">
      <div ref={setButtonElement} className="flex w-full justify-center [color-scheme:light]" />
      {isLoading ? (
        <div role="status" className="flex h-10 items-center justify-center gap-2 rounded-full border border-line text-xs text-ink-soft">
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" /> Loading Google sign-in…
        </div>
      ) : null}
      {isPending ? <p role="status" className="text-center text-xs text-ink-soft">Signing in…</p> : null}
      {error ? (
        <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
          <p role="alert" className="text-xs leading-5 text-ink-soft">{error}</p>
          <button type="button" onClick={retry} className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-brand-700 underline-offset-4 hover:underline">
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry Google sign-in
          </button>
        </div>
      ) : null}
    </div>
  );
}
