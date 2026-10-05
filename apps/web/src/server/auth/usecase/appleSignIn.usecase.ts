/** Apple sign-in for native iOS and verifier-bound browser flows on web and Android. */

import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "@/server/common/db";
import { invalid, UsecaseError } from "@/server/common/errors";
import { MAX_USER_NAME_LENGTH } from "../auth.constants";
import { APPLE_AUTHORIZE_URL, APPLE_CALLBACK_PATH, APPLE_CHALLENGE_SECONDS, APPLE_HASH_PATTERN,
  APPLE_MOBILE_RETURN, APPLE_NATIVE_CLIENT_ID, APPLE_NONCE_PATTERN, APPLE_RANDOM_BYTES } from "../apple.constants";
import * as appleRepository from "../repo/appleSignIn.repo";
import { findUserById, insertUser } from "../repo/users.repo";
import { avatarColorFor, createToken } from "./auth.usecase";
import { assertAppleSignInConfigured, encryptAppleToken, exchangeAppleCode, verifyAppleIdentity, type AppleIdentity } from "./apple.provider";
import { toPrivateUser } from "./user.mapper";

/**
 * Hashes proof material so database reads cannot redeem it.
 * @param value Raw nonce, state or client verifier.
 * @returns SHA-256 hexadecimal digest.
 */
export function appleProofHash(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Resolves the fixed deployment origin rather than trusting a request Host header.
 * @returns Configured HTTPS callback URL.
 */
function browserCallbackUrl(): string {
  const origin = new URL(process.env.APP_PUBLIC_URL ?? "https://haalkhata.app");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new UsecaseError("unavailable", "Apple callback must use a configured HTTPS origin");
  }
  return new URL(APPLE_CALLBACK_PATH, origin).href;
}

/**
 * Issues a one-use native challenge or a browser authorization URL bound to client proof.
 * @param input Browser/native flow, mobile return target, and optional verifier hash.
 * @returns Nonce and browser authorization URL when applicable.
 */
export async function beginAppleSignIn(input: { browserFlow: boolean; mobile: boolean; verifierHash: string }) {
  if (input.browserFlow && !APPLE_HASH_PATTERN.test(input.verifierHash)) invalid("a client verifier is required");
  await assertAppleSignInConfigured();
  const clientId = input.browserFlow ? process.env.APPLE_SERVICE_ID : APPLE_NATIVE_CLIENT_ID;
  if (!clientId) throw new UsecaseError("unavailable", "Apple browser sign-in is not configured");
  const nonce = crypto.randomBytes(APPLE_RANDOM_BYTES).toString("base64url");
  const state = crypto.randomBytes(APPLE_RANDOM_BYTES).toString("base64url");
  await appleRepository.insertAppleChallenge({ state_hash: appleProofHash(state), nonce_hash: appleProofHash(nonce),
    client_id: clientId, verifier_hash: input.browserFlow ? input.verifierHash : null,
    mobile: input.mobile, user_id: null }, APPLE_CHALLENGE_SECONDS);
  const authorization = new URL(APPLE_AUTHORIZE_URL);
  if (input.browserFlow) authorization.search = new URLSearchParams({ client_id: clientId,
    redirect_uri: browserCallbackUrl(), response_type: "code", response_mode: "form_post",
    scope: "name email", state, nonce }).toString();
  return { nonce, authorizationUrl: input.browserFlow ? authorization.href : "" };
}

/**
 * Creates or links only an Apple-verified identity, preserving an existing chosen name.
 * @param identity Cryptographically verified Apple claims.
 * @param name First-authorization display name, bounded and treated as untrusted text.
 * @param clientId Audience of the exchange.
 * @param refreshToken Apple credential to encrypt for later revocation.
 * @param client Transaction owning identity and credential writes.
 * @returns The local account with complete private profile fields.
 */
async function bindIdentity(identity: AppleIdentity, name: string, clientId: string, refreshToken: string, client: PoolClient) {
  const displayName = name.trim().slice(0, MAX_USER_NAME_LENGTH);
  await appleRepository.lockAppleIdentity(identity.email, client);
  let user = await appleRepository.findAppleUser(identity.subject, identity.email, client);
  if (user?.apple_sub && user.apple_sub !== identity.subject) {
    throw new UsecaseError("already_exists", "a different Apple account is already linked to that email");
  }
  const unclaimed = !user || (!user.password_hash && !user.google_sub && !user.apple_sub);
  if (!user) user = await insertUser({ email: identity.email, name: displayName || "Apple member",
    avatarColor: avatarColorFor(identity.subject), passwordHash: null }, client);
  await appleRepository.saveAppleIdentity(user.id, identity.subject, unclaimed ? displayName : "",
    clientId, encryptAppleToken(refreshToken), client);
  return user.id;
}

/**
 * Exchanges native Apple proof, consumes its challenge, and issues a local session.
 * @param input Native identity token, authorization code and optional first-use name.
 * @returns Private profile and session token.
 */
export async function logInWithApple(input: { idToken: string; authorizationCode: string; name: string }) {
  const identity = await verifyAppleIdentity(input.idToken, APPLE_NATIVE_CLIENT_ID);
  const exchanged = await exchangeAppleCode(input.authorizationCode, APPLE_NATIVE_CLIENT_ID);
  const exchangedIdentity = await verifyAppleIdentity(exchanged.identityToken, APPLE_NATIVE_CLIENT_ID);
  if (exchangedIdentity.subject !== identity.subject || exchangedIdentity.nonce !== identity.nonce) {
    throw new UsecaseError("unauthenticated", "Apple authorization does not match this attempt");
  }
  const userId = await transaction(async (client) => {
    const challenge = await appleRepository.consumeAppleNativeChallenge(appleProofHash(identity.nonce), client);
    if (!challenge || challenge.client_id !== APPLE_NATIVE_CLIENT_ID) {
      throw new UsecaseError("unauthenticated", "Apple sign-in expired. Please try again.");
    }
    return bindIdentity(identity, input.name, challenge.client_id, exchanged.refreshToken, client);
  });
  return appleSession(userId);
}

/**
 * Validates an Apple form-post callback and redirects only to a fixed client destination.
 * @param input Callback state, authorization code, first-use name and cancellation indicator.
 * @returns Token-free URL containing only state and a sanitized status.
 */
export async function handleAppleCallback(input: { state: string; code: string; name: string; cancelled: boolean }) {
  if (!APPLE_NONCE_PATTERN.test(input.state)) invalid("invalid Apple sign-in state");
  const stateHash = appleProofHash(input.state);
  const challenge = await appleRepository.findAppleBrowserChallenge(stateHash);
  if (!challenge) throw new UsecaseError("unauthenticated", "Apple sign-in expired");
  const destination = challenge.mobile ? new URL(APPLE_MOBILE_RETURN) : new URL("/login", browserCallbackUrl());
  destination.searchParams.set("apple_sign_in", input.state);
  if (input.cancelled) {
    destination.searchParams.set("apple_error", "cancelled");
    return destination.href;
  }
  try {
    const exchanged = await exchangeAppleCode(input.code, challenge.client_id, browserCallbackUrl());
    const identity = await verifyAppleIdentity(exchanged.identityToken, challenge.client_id);
    if (appleProofHash(identity.nonce) !== challenge.nonce_hash) throw new Error("nonce mismatch");
    await transaction(async (client) => {
      const userId = await bindIdentity(identity, input.name, challenge.client_id, exchanged.refreshToken, client);
      if (!await appleRepository.finishAppleBrowserChallenge(stateHash, userId, client)) {
        throw new UsecaseError("unauthenticated", "Apple sign-in expired");
      }
    });
  } catch {
    destination.searchParams.set("apple_error", "failed");
  }
  return destination.href;
}

/**
 * Redeems a browser callback with proof held only by the initiating client.
 * @param input Callback state and private random verifier.
 * @returns Private profile and session token.
 */
export async function completeAppleSignIn(input: { state: string; verifier: string }) {
  if (!APPLE_NONCE_PATTERN.test(input.state) || !APPLE_NONCE_PATTERN.test(input.verifier)) {
    throw new UsecaseError("unauthenticated", "invalid Apple sign-in proof");
  }
  const completed = await appleRepository.consumeAppleBrowserChallenge(appleProofHash(input.state), appleProofHash(input.verifier));
  if (!completed) throw new UsecaseError("unauthenticated", "Apple sign-in expired. Please try again.");
  return appleSession(completed.user_id);
}

/**
 * Loads the full profile after a successful native or browser transaction.
 * @param userId Verified local account id.
 * @returns Profile and purpose-bound session token.
 */
async function appleSession(userId: string) {
  const user = await findUserById(userId);
  if (!user || user.merged_into) throw new UsecaseError("unauthenticated", "account no longer exists");
  return { user: toPrivateUser(user), token: createToken(user.id, user.token_version) };
}
