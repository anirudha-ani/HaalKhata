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
      notes: "HaalKhata is a completely free expense splitter for iPhone and iPad. It has no subscriptions, in-app purchases, advertising or paid features. To review the app, select Sign in with Apple or Continue with Google on the welcome screen and sign in with your Apple or Google account. A new account is created on first sign-in; password sign-in is not available. Contacts, notifications, phone verification and receipt scanning are optional. Receipt scanning requests consent before sending a photo to the processors named in the app. Users can enter bills manually. Settlements record payments made outside HaalKhata; the app does not transfer money or process payments. Report and Block are available from a person’s page; account deletion is in Account settings.",
    };
  }
  return { configVersion: 0, apple };
};
