"use client";
/** Invite landing page: who invited you, to what, and one button in. */

import { inviteCopy, INVITE_SIGN_IN_HINT } from "@haalkhata/shared/invite/inviteCopy";
import Link from "next/link";
import { Handshake, UserPlus, Users } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useJoin } from "./hooks/useJoin";

/**
 * Renders the /join/<token> landing page.
 *
 * Works signed out: the preview call is unauthenticated on purpose, so the
 * page can say "Anirudha invited you to Bali Trip" BEFORE asking anyone to
 * create an account. Accepting requires a session; a signed-out visitor is
 * sent through login with `next` pointing back here, so after sign-in
 * they can accept the invite.
 *
 * @param props - Component props.
 * @returns The invite landing content.
 */
export function JoinPage({
  token,
}: {
  /** The invite token from the URL. */
  token: string;
}) {
  const { preview, viewer, accept, requestSent } = useJoin(token);

  const copy = preview.data ? inviteCopy(preview.data) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-card p-6 shadow-sm">
        {preview.isLoading ? (
          <Spinner />
        ) : preview.isError ? (
          <>
            <h1 className="text-xl font-bold">This invite link isn&apos;t active</h1>
            <p className="text-sm text-ink-soft">{errorMessage(preview.error)}</p>
            <Link href="/" className="block text-sm font-semibold text-brand-600">
              Go to HaalKhata →
            </Link>
          </>
        ) : preview.data ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              {preview.data.kind === "group" ? (
                <Users className="h-6 w-6" />
              ) : preview.data.kind === "profile" ? (
                <UserPlus className="h-6 w-6" />
              ) : (
                <Handshake className="h-6 w-6" />
              )}
            </div>
            <h1 className="text-xl font-bold" style={{ textWrap: "balance" }}>
              {copy?.title}
            </h1>
            <p className="text-sm text-ink-soft">
              {copy?.description}
            </p>

            {viewer.data ? (
              requestSent ? (
                <p className="rounded-xl bg-pos-50 px-4 py-3 text-sm font-medium text-pos-700">
                  {copy?.requestSent}
                </p>
              ) : (
              <>
                <button
                  type="button"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate()}
                  className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {accept.isPending ? "One moment…" : copy?.action}
                </button>
                {accept.isError ? (
                  <p className="text-sm font-medium text-brand-600">
                    {errorMessage(accept.error)}
                  </p>
                ) : null}
                <p className="text-xs text-ink-soft">
                  Signed in as {viewer.data.name}.{" "}
                  <Link href="/dashboard" className="font-medium text-brand-600">
                    Not now
                  </Link>
                </p>
              </>
              )
            ) : viewer.isLoading ? (
              <Spinner />
            ) : (
              <>
                <Link
                  href={`/login?next=/join/${token}`}
                  className="block w-full rounded-xl bg-brand-600 py-3 text-center font-semibold text-white hover:bg-brand-700"
                >
                  Sign in to accept
                </Link>
                <p className="text-xs text-ink-soft">
                  {INVITE_SIGN_IN_HINT}
                </p>
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
