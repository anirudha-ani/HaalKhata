"use client";
/** Account page: view/edit profile (name, default currency) and sign out. */

import { errorMessage } from "@/lib/api/connect";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useAccountAPI } from "./hooks/useAccountAPI";
import { ProfileForm } from "./components/ProfileForm/ProfileForm";

/**
 * Renders the account screen: a spinner until the signed-in user is loaded,
 * then the profile form for that user.
 *
 * @returns The account page content.
 */
export function AccountPage() {
  const { me: currentUser, isLoading, loadError, retry } = useAccountAPI();
  const hydrated = useHydrated();
  if (!hydrated || isLoading) return <Spinner />;
  if (!currentUser) return <div className="space-y-3 p-6"><p role="alert">{errorMessage(loadError)}</p><button type="button" className="underline" onClick={() => { void retry(); }}>Try again</button></div>;
  return <ProfileForm me={currentUser} />;
}
