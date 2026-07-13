"use client";
/** App chrome around authed pages: desktop sidebar, mobile header, and bottom nav. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CircleUserRound, LogOut, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { authClient } from "@/lib/api/connect";
import { NAVIGATION_ITEMS, MOBILE_LEFT_NAV, MOBILE_RIGHT_NAV } from "./shell.constants";
import { Avatar } from "@/components/ui/Avatar";
import { useShellData } from "./hooks/useShellData";

/** Renders the HaalKhata wordmark linking back to the dashboard. */
function Logo() {
  return (
    <Link href="/dashboard" className="flex items-baseline gap-2 px-1">
      <span className="font-display text-2xl font-bold text-brand-600">হালখাতা</span>
      <span className="hidden text-xs font-medium tracking-widest text-ink-soft uppercase lg:inline">
        HaalKhata
      </span>
    </Link>
  );
}

/**
 * Renders the app chrome around authenticated pages: a desktop sidebar with
 * navigation and the signed-in user, a mobile header, a mobile bottom nav with
 * a floating add-expense button, and the page content in between.
 */
export function AppShell({
  children,
}: {
  /** The page content to render inside the shell's main area. */
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentUser, unreadCount } = useShellData();

  /** Logs the user out, clears all cached queries, and redirects to the login page. */
  const signOut = async () => {
    await authClient.logOut({});
    queryClient.clear();
    router.push("/login");
  };

  /**
   * Reports whether a navigation destination matches the current route (exactly or as a section prefix).
   *
   * @param href - The navigation item's destination path.
   * @returns True when the current pathname is the destination or nested under it.
   */
  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar — pinned to the viewport's left edge, not centered */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-line bg-card px-4 py-6 md:flex">
        <div className="space-y-6">
          <Logo />
          <nav className="space-y-1">
            {NAVIGATION_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-soft hover:bg-paper hover:text-ink"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
                {href === "/activity" && unreadCount > 0 ? (
                  <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <Link
            href="/expenses/new"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add expense
          </Link>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-3 border-t border-line pt-4">
            <Avatar user={currentUser} />
            <Link href="/account" className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{currentUser.name}</p>
              <p className="truncate text-xs text-ink-soft">{currentUser.email}</p>
            </Link>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="rounded-lg p-2 text-ink-soft hover:bg-paper hover:text-brand-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </aside>

      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <Link href="/activity" className="relative rounded-full p-2 text-ink-soft">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-card" />
              ) : null}
            </Link>
            <Link href="/account" className="rounded-full p-2 text-ink-soft">
              {currentUser ? (
                <Avatar user={currentUser} size="sm" />
              ) : (
                <CircleUserRound className="h-5 w-5" />
              )}
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {MOBILE_LEFT_NAV.map(({ href, label, icon: Icon }) => (
            <MobileTab key={href} href={href} label={label} active={isActive(href)} icon={<Icon className="h-5 w-5" />} />
          ))}
          <Link
            href="/expenses/new"
            aria-label="Add expense"
            className="mx-auto -mt-5 flex h-13 w-13 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30"
          >
            <Plus className="h-6 w-6" />
          </Link>
          {MOBILE_RIGHT_NAV.map(({ href, label, icon: Icon }) => (
            <MobileTab key={href} href={href} label={label} active={isActive(href)} icon={<Icon className="h-5 w-5" />} />
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Renders one tab in the mobile bottom navigation: an icon over its label, tinted when active. */
function MobileTab({
  href,
  label,
  icon,
  active,
}: {
  /** Destination path the tab links to. */
  href: string;
  /** Short label rendered under the icon. */
  label: string;
  /** Icon element rendered above the label. */
  icon: ReactNode;
  /** Whether the tab's destination matches the current route. */
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-medium ${
        active ? "text-brand-600" : "text-ink-soft"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
