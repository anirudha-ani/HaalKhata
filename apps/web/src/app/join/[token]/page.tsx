"use client";
/** Public landing page for invite links: who invited you, to what, and one button in. */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Handshake, UserPlus, Users } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { authClient, errorMessage, socialClient } from "@/lib/api/connect";

/**
 * Renders the /join/<token> landing page.
 *
 * Works signed out: the preview call is unauthenticated on purpose, so the
 * page can say "Anirudha invited you to Bali Trip" BEFORE asking anyone to
 * create an account. Accepting requires a session; a signed-out visitor is
 * sent through login with `next` pointing back here, so one Google tap later
 * the invite completes itself.
 *
 * @returns The invite landing content.
 */
export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? "";

  const preview = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => socialClient.previewInviteLink({ token }),
    retry: false,
  });
  // getMe failing just means "not signed in" — that is a state, not an error.
  const viewer = useQuery({
    queryKey: ["me"],
    queryFn: () => authClient.getMe({}),
    retry: false,
  });

  const [requestSent, setRequestSent] = useState(false);
  const accept = useMutation({
    mutationFn: () => socialClient.acceptInviteLink({ token }),
    onSuccess: (result) => {
      // A profile link produces a pending request, not a friendship yet —
      // redirecting to Friends would show nothing and read as a silent fail.
      if (preview.data?.kind === "profile") {
        setRequestSent(true);
        return;
      }
      router.push(result.groupId ? `/groups/${result.groupId}` : "/friends");
    },
  });

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
              {preview.data.kind === "group"
                ? `${preview.data.inviterName} invited you to “${preview.data.groupName}”`
                : preview.data.kind === "profile"
                  ? `${preview.data.inviterName} wants to connect on HaalKhata`
                  : `${preview.data.inviterName} invited you to HaalKhata`}
            </h1>
            <p className="text-sm text-ink-soft">
              {preview.data.kind === "group"
                ? `A shared expense group with ${preview.data.memberCount} ${
                    preview.data.memberCount === 1 ? "member" : "members"
                  }. Accepting adds you to it.`
                : preview.data.kind === "profile"
                  ? "Accepting sends them a friend request; you'll be connected once they confirm."
                  : `They added you as “${preview.data.invitedName}”. Accepting brings that
                     invitation — friendships and any group seats — onto your account.`}
            </p>

            {viewer.data ? (
              requestSent ? (
                <p className="rounded-xl bg-pos-50 px-4 py-3 text-sm font-medium text-pos-700">
                  Request sent — {preview.data.inviterName} will confirm from their side.
                </p>
              ) : (
              <>
                <button
                  type="button"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate()}
                  className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {accept.isPending
                    ? "One moment…"
                    : preview.data.kind === "group"
                      ? "Join the group"
                      : preview.data.kind === "profile"
                        ? "Send friend request"
                        : "Accept the invite"}
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
                  New here? Signing in with Google creates your account, then this
                  invite completes itself.
                </p>
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
