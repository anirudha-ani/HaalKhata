"use client";
/** Mobile tab: one entry of the bottom navigation, an icon over its label with an optional count badge. */

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders one tab in the mobile bottom navigation: an icon over its label,
 * tinted when active, with a count pinned to the icon's corner when there is
 * something waiting behind it.
 */
export function MobileTab({
  href,
  label,
  icon,
  active,
  badge = 0,
}: {
  /** Destination path the tab links to. */
  href: string;
  /** Short label rendered under the icon. */
  label: string;
  /** Icon element rendered above the label. */
  icon: ReactNode;
  /** Whether the tab's destination matches the current route. */
  active: boolean;
  /** Items waiting behind this tab; 0 shows no badge. */
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-medium ${
        active ? "text-brand-600" : "text-ink-soft"
      }`}
    >
      <span className="relative">
        {icon}
        {badge > 0 ? (
          <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-brand-600 px-1 text-center text-[10px] leading-4 font-bold text-white ring-2 ring-card">
            {badge}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  );
}
