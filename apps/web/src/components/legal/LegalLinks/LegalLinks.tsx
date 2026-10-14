/** Public privacy/support navigation available without an account. */

import Link from "next/link";
import { PRIVACY_PATH, SUPPORT_PATH } from "@haalkhata/shared/legal/links";

/**
 * Renders keyboard-accessible links to published policy and help pages.
 * @returns Public legal navigation.
 */
export function LegalLinks() {
  return <nav aria-label="Privacy and support" className="flex flex-wrap justify-center gap-4 py-3 text-xs text-ink-soft">
    <Link className="underline" href={PRIVACY_PATH}>Privacy policy</Link>
    <Link className="underline" href={SUPPORT_PATH}>Help and support</Link>
  </nav>;
}
