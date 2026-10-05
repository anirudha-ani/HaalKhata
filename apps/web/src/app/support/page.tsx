/** Public product help and monitored-contact details for users and App Review. */

import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";

/** Public support page metadata. */
export const metadata = { title: "Help and support" };

/**
 * Explains common tasks and provides the publisher's configured support contact.
 * @returns Help page accessible without a session.
 */
export default function SupportPage() {
  const supportEmail = process.env.SUPPORT_EMAIL;
  return <main className="mx-auto max-w-3xl space-y-7 px-6 py-12 text-ink">
    <Link className="font-semibold text-brand-600" href="/login">HaalKhata</Link>
    <h1 className="text-4xl font-bold">Help and support</h1>
    <p>HaalKhata helps friends record shared expenses and settlements. It does not move money between bank accounts.</p>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Contact us</h2>
      {supportEmail ? <p>Email <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> for app problems, privacy requests or content reports. Include the app version and steps to reproduce a problem. Avoid sending passwords, sign-in tokens, full payment card numbers or receipt photos with sensitive information.</p> : <p>The publisher must configure a monitored support address before launch.</p>}
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Sign in and invitations</h2>
      <p>Continue with Google or Apple. When using Apple, keep using that Apple account to reach the same ledger. Hide My Email is supported. Open an invitation link after signing in to join its group or send its friend request.</p>
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Receipt scanning</h2>
      <p>Take or choose a clear photo, review and accept the processor disclosure, then choose “Itemize with AI.” Check the extracted names, quantities, tax, tip and total before saving. You can enter all details manually if you decline sharing or scanning is unavailable.</p>
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Safety and deletion</h2>
      <p>Use the report controls on inappropriate content and the block controls for unwanted contact. Blocking does not rewrite shared financial history. Use Account → Delete account to erase your personal data permanently; shared amounts remain anonymous to preserve other members&apos; balances.</p>
    </section>
    <LegalLinks />
  </main>;
}
