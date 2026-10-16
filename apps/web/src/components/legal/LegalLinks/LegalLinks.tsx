/** Public privacy/support navigation available without an account. */

import Link from "next/link";
import { ChevronRight, FileText, LifeBuoy } from "lucide-react";
import { PRIVACY_PATH, SUPPORT_PATH } from "@haalkhata/shared/legal/links";

/**
 * Renders keyboard-accessible links to published policy and help pages.
 * @param props - Compact footer links or full-width settings rows.
 * @returns Public legal navigation.
 */
export function LegalLinks({ layout = "inline" }: { layout?: "inline" | "rows" }) {
  if (layout === "rows") return <nav aria-label="Privacy and support" className="divide-y divide-line">
    <Link className="flex min-h-12 items-center gap-3 py-3 text-sm font-medium hover:text-brand-600" href={PRIVACY_PATH}>
      <FileText className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
      <span className="min-w-0 flex-1">Privacy policy</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
    </Link>
    <Link className="flex min-h-12 items-center gap-3 py-3 text-sm font-medium hover:text-brand-600" href={SUPPORT_PATH}>
      <LifeBuoy className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
      <span className="min-w-0 flex-1">Help and support</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
    </Link>
  </nav>;
  return <nav aria-label="Privacy and support" className="flex flex-wrap justify-center gap-4 py-3 text-xs text-ink-soft">
    <Link className="underline" href={PRIVACY_PATH}>Privacy policy</Link>
    <Link className="underline" href={SUPPORT_PATH}>Help and support</Link>
  </nav>;
}
