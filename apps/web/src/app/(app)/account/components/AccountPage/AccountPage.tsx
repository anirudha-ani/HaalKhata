"use client";
/** Account page: view/edit profile (name, default currency) and sign out. */

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
  const { me: currentUser, isLoading } = useAccountAPI();
  const hydrated = useHydrated();
  if (!hydrated || isLoading || !currentUser) return <Spinner />;
  return <ProfileForm me={currentUser} />;
}
