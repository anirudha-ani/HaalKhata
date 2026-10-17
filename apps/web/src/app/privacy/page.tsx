/** Public privacy policy matching the app's account, receipt, contact-matching and shared-ledger behavior. */

import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks/LegalLinks";
import { receiptProcessingInfo } from "@/server/receipt/usecase/receiptConsent.usecase";
import { ACCOUNT_ERASURE_MESSAGE, SHARED_LEDGER_ERASURE_MESSAGE } from "@haalkhata/shared/account/deletion";

/** Privacy page title shown by browsers and search results. */
export const metadata = { title: "Privacy policy" };

/**
 * Describes collected data, purpose, recipients, retention and in-app deletion.
 * @returns Policy accessible before login and by App Review.
 */
export default function PrivacyPage() {
  const supportEmail = process.env.SUPPORT_EMAIL;
  return <main className="mx-auto max-w-3xl space-y-7 px-6 py-12 text-ink">
    <Link href="/login" className="font-semibold text-brand-600">HaalKhata</Link>
    <h1 className="text-4xl font-bold">Privacy policy</h1>
    <p className="text-sm text-ink-soft">Effective October 17, 2026. Applies to the HaalKhata mobile app and website.</p>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Information we use</h2>
      <p>HaalKhata stores your account identifier, display name, sign-in provider identifier, email (including an Apple private relay address), optional profile image, default currency, and any phone number or payment methods you choose to add. Payment methods can include names, currencies, instructions, contact information, bank account details and payment links that you provide. We use these to authenticate you, find invitations, display your profile and help your expense partners settle outside the app.</p>
      <p>We store groups, membership, expenses, dates, amounts, currencies, splits, items, settlements, comments, invitations, activity and in-app notifications to provide the shared ledger. Account email and phone fields are private to your own profile. People sharing expenses can see your display identity. Your payment methods are shown only to people who owe you, including within a particular shared group or expense scope.</p>
      <p>Security processing uses request IP addresses, short-lived sign-in challenges, hashed phone destinations, verification attempts and limited diagnostic logs to prevent fraud and abuse. We do not include advertising, cross-app tracking or an analytics SDK in the app.</p>
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Optional photos and AI</h2>
      <p>Camera access is requested when you take a receipt photo. Choosing an existing photo uses the system picker. A photo stays on your device until you choose “Itemize with AI” and have allowed AI receipt scanning. We ask before your first scan and remember permission on your account across web and mobile. You can withdraw permission in Account → AI receipt scanning; future scans will ask again. Changes to the recipients or sharing terms require renewed permission. Manual expense entry works without photos or AI.</p>
      <p>{receiptProcessingInfo().disclosure}</p>
      <p>We store the accepted sharing-terms version and the time you granted permission with your account. Withdrawing permission removes that record and stops future scans from proceeding without renewed permission; it cannot recall an image already sent for processing.</p>
      <p>Our production receipt service requests zero data retention from OpenRouter. Provider terms govern their processing; review <a className="underline" href="https://openrouter.ai/privacy">OpenRouter&apos;s privacy policy</a> and <a className="underline" href="https://policies.google.com/privacy">Google&apos;s privacy policy</a>. We do not promise that a provider&apos;s terms can never change. Receipt images are processed temporarily and returned for review; they are not saved in our database. Parsed expense text and amounts are saved only when you submit an expense.</p>
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Finding friends from your contacts</h2>
      <p>In the mobile app you can choose Find friends to see which of your contacts already use HaalKhata. Contacts access is requested only then, after we explain it, and you can share all of your contacts, only some, or none. The app reads names, phone numbers and email addresses. Names stay on your device. Phone numbers and email addresses are sent to our server to be matched, then discarded: they are not stored, logged or used for anything else, and a number that matches nobody is never added to HaalKhata. We keep only a daily count of how many were checked, to prevent abuse. Friend requests are sent only when you tap Add or confirm Send to all, which first shows everyone it would ask.</p>
      <p>Other people can find you this way while “Let people find me from their contacts” is on. It is on by default, including for accounts created before this feature, and the app tells you so once with the option to turn it off. You can also turn it off during sign-up or in Account → Privacy. While it is on, someone who has your verified phone number or your sign-in email saved can see your name and profile picture and send you a friend request. We never show them your phone number or email. Blocking someone also stops them from finding you. Once you turn the setting off, nobody can find you this way until you turn it back on.</p>
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Other service providers</h2>
      <p>Google and Apple process sign-in. Apple offers Hide My Email. Twilio processes phone numbers and SMS verification when you choose to verify a phone number. When you turn on notifications in the app, your phone&apos;s push token is stored with your account, and each notification&apos;s title and text pass through the Expo Push Service and Apple Push Notification service to reach it; Expo holds notification contents only while delivering them. A notification never contains payment details. You can choose which notifications you receive, or remove a phone, in Account → Notifications, and turn them off entirely in your phone&apos;s settings. Our hosting and database services process app data to operate HaalKhata. We do not sell personal information.</p>
      <p>Payment links open third-party payment apps or websites at your request. HaalKhata records settlements; it does not process payments or receive your bank login credentials.</p>
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Storage and deletion</h2>
      <p>The mobile app stores your session credential in the operating system&apos;s secure store. Financial query data is held in memory. Temporary photo files may remain in device caches until the operating system clears them.</p>
      <p>Use Account → Delete account on mobile or web. {ACCOUNT_ERASURE_MESSAGE} {SHARED_LEDGER_ERASURE_MESSAGE}</p>
      <p>Private safety reports include the reported content, reason and account identifiers so moderators can investigate. The reported person is not notified of the reporter’s identity. Reports are removed when the reporting or reported account is deleted. Short-lived security records expire according to their operational windows. Encrypted local backups rotate after about 31 days; offsite backup expiry must follow the same schedule. Deleted data is not used to recreate your account. Limited information may be retained when required by law or to resolve an abuse report. Contact us for privacy requests or questions about retention.</p>
    </section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Your choices and contact</h2>
      <p>You can edit your profile, remove a phone number or payment methods, deny camera or contacts access, choose whether people can find you from their contacts, enter expenses manually, and delete your account. You can report inappropriate content and block unwanted contact from the app.</p>
      <p>HaalKhata is operated by the publisher listed on its App Store listing. {supportEmail ? <>Contact: <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</> : <>The publisher must configure its support contact before launch.</>}</p>
      <p>HaalKhata is not directed to children under 13. If you believe a child&apos;s personal information has been submitted, contact us for removal. We publish policy changes here and update the effective date.</p>
    </section>
    <LegalLinks />
  </main>;
}
