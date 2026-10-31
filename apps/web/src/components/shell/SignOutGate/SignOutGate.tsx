"use client";
/** Keeps a signed-in page off the screen once its session is ending. */

import type { ReactNode } from "react";
import { SIGN_OUT_STUCK_MESSAGE } from "./constants/signOutGate";
import { useSignOutGate } from "./hooks/useSignOutGate";

/**
 * Shows the app until a sign-out starts, here or in another tab, or the server
 * refuses the session. From then on nothing of the account is on screen, and
 * if the server cannot be reached this says so instead of pretending.
 *
 * @param props - Component props.
 * @param props.children - The signed-in app.
 * @returns The app, or the screen a sign-out waits on.
 */
export function SignOutGate({ children }: { children: ReactNode }) {
  const gate = useSignOutGate();
  if (!gate.pending) return children;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper p-6">
      <section className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-card p-6 text-center" role="status">
        <h1 className="text-lg font-bold">{gate.failed ? "Almost signed out" : "Signing out…"}</h1>
        {gate.failed ? (
          <>
            <p className="text-sm text-ink-soft">{SIGN_OUT_STUCK_MESSAGE}</p>
            <button
              type="button"
              onClick={() => void gate.retry()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Try again
            </button>
          </>
        ) : null}
      </section>
    </main>
  );
}
