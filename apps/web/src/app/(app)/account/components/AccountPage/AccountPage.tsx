"use client";
/** Account page: view/edit profile (name, default currency) and sign out. */

import { LogOut } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { useAccountAPI, useProfileForm } from "./hooks/useAccount";

/**
 * Renders the account screen: a spinner until the signed-in user is loaded,
 * then the profile form for that user.
 *
 * @returns The account page content.
 */
export function AccountPage() {
  const { me: currentUser, isLoading } = useAccountAPI();
  if (isLoading || !currentUser) return <Spinner />;
  return <ProfileForm me={currentUser} />;
}

/**
 * Renders the profile summary card, the editable profile form (display name
 * and default currency), and the sign-out button.
 *
 * @param props - Component props.
 * @param props.me - The signed-in user whose profile is shown and edited.
 * @returns The profile form section of the account page.
 */
function ProfileForm({ me: currentUser }: { me: User }) {
  const form = useProfileForm(currentUser);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-3xl font-bold">Account</h1>

      <div className="flex items-center gap-4 rounded-2xl border border-line bg-card p-5">
        <Avatar user={currentUser} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{currentUser.name}</p>
          <p className="truncate text-sm text-ink-soft">{currentUser.email}</p>
        </div>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-line bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          form.save();
        }}
      >
        <label className="block text-sm font-medium">
          Display name
          <input
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium">
          Default currency
          <select
            value={form.currency}
            onChange={(event) => form.setCurrency(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 focus:border-brand-500 focus:outline-none"
          >
            {CURRENCIES.map((currencyCode) => (
              <option key={currencyCode}>{currencyCode}</option>
            ))}
          </select>
        </label>
        {form.message ? <p className="text-sm text-ink-soft">{form.message}</p> : null}
        <button
          type="submit"
          disabled={form.isSaving}
          className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {form.isSaving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <button
        type="button"
        onClick={form.signOut}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card py-3 font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
