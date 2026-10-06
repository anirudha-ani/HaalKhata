"use client";
/** Logo: the HaalKhata brand mark and wordmark, linking to the dashboard. */

import Link from "next/link";
import Image from "next/image";

/** Renders the HaalKhata brand mark and wordmark linking to the dashboard. */
export function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
      <Image
        src="/icon-192.png"
        alt=""
        aria-hidden="true"
        className="h-8 w-8 rounded-lg"
        height={32}
        width={32}
      />
      <span className="font-display text-2xl font-bold text-brand-600">HaalKhata</span>
    </Link>
  );
}
