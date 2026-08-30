/** Google sign-in constants for the mobile login screen. */

import { Platform } from "react-native";

/**
 * Native OAuth client id for Android builds. Public by design (it identifies
 * the app, it does not authenticate it) and inlined at build time through
 * Expo's public env, so a release build must be made with it set.
 */
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";

/** Native OAuth client id for iOS builds; same rules as the Android one. */
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

/** Whether this platform's build carries a client id to sign in with. */
export const GOOGLE_SIGN_IN_CONFIGURED =
  Platform.select({
    android: GOOGLE_ANDROID_CLIENT_ID,
    ios: GOOGLE_IOS_CLIENT_ID,
    default: "",
  }) !== "";

/** Identity only — the app never acts on a Google account's behalf. */
export const GOOGLE_SCOPES = ["openid", "email", "profile"];

/**
 * Whether to offer the email/phone + password form. Google is the only way
 * into production; the password form stays in development so seeded accounts
 * remain reachable. Mirrors `passwordAuthEnabled()` on the server, which is
 * the enforcing side — this only decides whether a control that would be
 * rejected anyway is worth rendering.
 */
export const PASSWORD_AUTH_ENABLED = typeof __DEV__ !== "undefined" && __DEV__;
