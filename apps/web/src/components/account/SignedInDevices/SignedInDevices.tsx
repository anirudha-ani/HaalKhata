"use client";
/** Every browser and phone this account is signed in on, each of which can be signed out. */

import {
  END_OTHER_SESSIONS_CANCEL_LABEL,
  END_OTHER_SESSIONS_CONFIRM_LABEL,
  END_OTHER_SESSIONS_LABEL,
  END_OTHER_SESSIONS_WARNING,
  SESSIONS_TITLE,
} from "@haalkhata/shared/auth/sessions";
import { DeviceRow } from "./components/DeviceRow/DeviceRow";
import { useSignedInDevices } from "./hooks/useSignedInDevices";

/**
 * Lists where the account is signed in. Signing one out touches nothing else,
 * and that device is sent to sign in again the next time it asks for anything.
 *
 * @returns The settings section.
 */
export function SignedInDevices() {
  const devices = useSignedInDevices();
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-5" aria-label={SESSIONS_TITLE}>
      <h2 className="text-lg font-semibold">{SESSIONS_TITLE}</h2>
      {devices.loading ? <p className="text-sm text-ink-soft">Loading your devices…</p> : null}
      {devices.readError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-neg-700">{devices.readError}</p>
          <button type="button" className="text-sm underline" onClick={() => void devices.retry()}>
            Try again
          </button>
        </div>
      ) : null}
      <ul className="divide-y divide-line">
        {devices.sessions.map((session) => (
          <DeviceRow key={session.id} devices={devices} session={session} />
        ))}
      </ul>
      {devices.error ? <p role="alert" className="text-sm text-neg-700">{devices.error}</p> : null}
      {devices.hasOthers && !devices.confirmingOthers ? (
        <button
          type="button"
          onClick={() => devices.setConfirmingOthers(true)}
          className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold"
        >
          {END_OTHER_SESSIONS_LABEL}
        </button>
      ) : null}
      {devices.hasOthers && devices.confirmingOthers ? (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm text-ink-soft">{END_OTHER_SESSIONS_WARNING}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={devices.endingOthers}
              onClick={devices.endOthers}
              className="min-h-10 rounded-lg bg-neg-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {devices.endingOthers ? "Signing out…" : END_OTHER_SESSIONS_CONFIRM_LABEL}
            </button>
            <button
              type="button"
              onClick={() => devices.setConfirmingOthers(false)}
              className="min-h-10 rounded-lg border border-line px-3 text-sm font-semibold text-ink-soft"
            >
              {END_OTHER_SESSIONS_CANCEL_LABEL}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
