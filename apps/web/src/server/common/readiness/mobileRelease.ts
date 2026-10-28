/** Public mobile-release metadata and platform association documents. */

import { GOOGLE_MOBILE_CLIENT_IDS } from "@/server/auth/auth.constants";
import { isEmailAddress } from "@haalkhata/shared/email/email";
import { APPLE_NATIVE_CLIENT_ID } from "@/server/auth/apple.constants";
import { assertAppleSignInConfigured } from "@/server/auth/usecase/apple/apple.provider";

/** Apple Team ID or legacy App ID prefix format. */
const APPLE_PREFIX_PATTERN = /^[A-Z0-9]{10}$/;
/** Android signing certificate fingerprint, including colon separators. */
const ANDROID_CERTIFICATE_PATTERN = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

/**
 * Builds the iOS universal-link association from the operator's actual signing prefix.
 * @returns Association document, or null until credentials have been configured.
 */
export function appleAppAssociation() {
  const prefix = process.env.APPLE_APP_ID_PREFIX || process.env.APPLE_TEAM_ID || "";
  if (!APPLE_PREFIX_PATTERN.test(prefix)) return null;
  return { applinks: { details: [{ appIDs: [`${prefix}.${APPLE_NATIVE_CLIENT_ID}`], components: [{ "/": "/join/*" }] }] } };
}

/**
 * Builds Android verified-link claims for the real production signing certificates.
 * @returns Digital Asset Links, or null for missing/malformed fingerprints.
 */
export function androidAssetLinks() {
  const certificates = (process.env.ANDROID_SHA256_CERTIFICATES ?? "").split(",").map((value) => value.trim().toUpperCase());
  if (!certificates.length || certificates.some((value) => !ANDROID_CERTIFICATE_PATTERN.test(value))) return null;
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app",
    package_name: APPLE_NATIVE_CLIENT_ID, sha256_cert_fingerprints: certificates } }];
}

/**
 * Checks settings a production bundle depends on without exposing private credentials.
 * @returns Public release-protocol and native Google audiences.
 */
export async function mobileReleaseInfo() {
  if (!isEmailAddress(process.env.SUPPORT_EMAIL ?? "") || !appleAppAssociation()) {
    throw new Error("mobile release requires a valid support address and Apple App ID prefix");
  }
  await assertAppleSignInConfigured();
  return { protocolVersion: 1, bundleIdentifier: APPLE_NATIVE_CLIENT_ID,
    googleMobileClientIds: GOOGLE_MOBILE_CLIENT_IDS, appleSignIn: true };
}
