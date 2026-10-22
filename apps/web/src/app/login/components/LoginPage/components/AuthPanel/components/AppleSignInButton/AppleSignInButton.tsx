/** Apple sign-in control aligned with Google's standard large pill button. */

import { APPLE_LOGO_PATH, APPLE_LOGO_VIEW_BOX } from "@haalkhata/shared/auth/providerArtwork";

/**
 * Renders the provider mark and pending state without changing the auth flow.
 * @param props - Current sign-in progress and the existing Apple action.
 * @returns A full-width, keyboard-accessible Apple button.
 */
export function AppleSignInButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={busy} aria-busy={busy} onClick={onClick}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-black bg-black px-3 text-sm font-medium text-white transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50">
      <svg aria-hidden="true" focusable="false" className="h-[18px] w-[18px] shrink-0" viewBox={APPLE_LOGO_VIEW_BOX} fill="currentColor">
        <path d={APPLE_LOGO_PATH} />
      </svg>
      <span>{busy ? "Signing in…" : "Continue with Apple"}</span>
    </button>
  );
}
