"use client";
/** One place this account is signed in. */

import { Globe, Smartphone } from "lucide-react";
import { END_SESSION_LABEL, sessionDetail } from "@haalkhata/shared/auth/sessions";
import type { Session } from "@haalkhata/protogen/auth/v1/auth_pb";
import type { SignedInDevicesController } from "../../hooks/useSignedInDevices";

/**
 * Shows what a device is and how recently it was used. The one being used has
 * no button here: Sign out, further down, is how to leave it.
 *
 * @param props - The sign-in and the list's controller.
 * @returns The list item.
 */
export function DeviceRow({ session, devices }: { session: Session; devices: SignedInDevicesController }) {
  const Icon = session.isApp ? Smartphone : Globe;
  return (
    <li className="flex items-center gap-3 py-3">
      <Icon className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{session.device}</p>
        <p className={`text-xs ${session.current ? "font-semibold text-pos-700" : "text-ink-soft"}`}>
          {sessionDetail(session, devices.clock)}
        </p>
      </div>
      {session.current ? null : (
        <button
          type="button"
          aria-label={`${END_SESSION_LABEL} ${session.device}`}
          disabled={devices.endingId === session.id}
          onClick={() => devices.endOne(session.id)}
          className="min-h-9 rounded-lg border border-line px-3 text-sm font-semibold text-ink-soft hover:border-brand-200 disabled:opacity-50"
        >
          {devices.endingId === session.id ? "Signing out…" : END_SESSION_LABEL}
        </button>
      )}
    </li>
  );
}
