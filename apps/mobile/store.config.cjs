/** App Store copy selected for the first release; private review contact stays in the environment. */
const metadata = require("./store/1.0.0/metadata.json");

/**
 * Builds the store payload without embedding private contact details in source control.
 * @returns The EAS Metadata configuration for the existing editable version.
 */
module.exports = function storeConfiguration() {
  const apple = {
    version: "1.0",
    copyright: metadata.copyright,
    categories: [metadata.primaryCategory],
    info: {
      [metadata.locale]: {
        title: metadata.name,
        subtitle: metadata.subtitle,
        description: metadata.description,
        keywords: metadata.keywords.split(","),
        promoText: metadata.promotionalText,
        supportUrl: metadata.supportUrl,
        marketingUrl: metadata.marketingUrl,
        privacyPolicyUrl: metadata.privacyPolicyUrl,
      },
    },
  };
  if (process.env.HAALKHATA_REVIEW_PHONE) {
    apple.review = {
      firstName: "Anirudha",
      lastName: "Paul",
      email: "haalkhata@protonmail.com",
      phone: process.env.HAALKHATA_REVIEW_PHONE,
      notes: `HaalKhata is a completely free expense splitter for iPhone and iPad. It has no subscriptions, in-app purchases, advertising or paid features. Select Sign in with Apple or Continue with Google on the welcome screen. A new account is created on first sign-in; password sign-in is not available. Contacts, notifications, phone verification and receipt scanning are optional.

AI privacy review: create an expense, choose or take a receipt photo, then tap Itemize with AI. Before upload, a dialog explains that the selected photo and all visible text, including any names, addresses, phone numbers or payment details, will be sent to OpenRouter and Google (Gemini) to extract receipt details. Allow AI scanning grants permission; Enter manually or closing the dialog sends no photo. Permission applies to future scans on the account and can be withdrawn in Account → AI receipt scanning. To repeat the review flow, withdraw permission and start another scan.

The privacy policy is linked in the permission dialog and at https://haalkhata.app/privacy. It explains collection, use, recipients, retention, withdrawal and the requirement for providers to offer the same or equal protection. HaalKhata does not store receipt photos on its server. The AI request excludes account profiles, contacts, saved payment methods and other expenses. Provider safety and legal retention exceptions are disclosed in the policy.

Settlements record payments made outside HaalKhata; the app does not transfer money or process payments. Report and Block are available from a person's page; account deletion is in Account settings.`,
    };
  }
  return { configVersion: 0, apple };
};
