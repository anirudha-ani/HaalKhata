/** Checks real local Apple signing/encryption configuration without printing credentials or calling Apple. */

import { loadEnvironmentFile } from "../../../scripts/environment.mjs";
import { APPLE_NATIVE_CLIENT_ID } from "../src/server/auth/apple.constants";
import { assertAppleSignInConfigured } from "../src/server/auth/usecase/apple/apple.provider";
import { appleBrowserCallbackUrl } from "../src/server/auth/usecase/apple/apple.config";

loadEnvironmentFile();

/** Requested flow: native iOS does not need a browser domain or Services ID. */
const nativeFlow = process.argv.includes("--ios");

try {
  const callback = nativeFlow ? "" : appleBrowserCallbackUrl();
  await assertAppleSignInConfigured(nativeFlow ? APPLE_NATIVE_CLIENT_ID : undefined);
  console.log("PASS: Apple private key can sign a client secret; refresh-token encryption is configured.");
  if (callback) {
    console.log(`Register this return URL on the Apple Services ID: ${callback}`);
    console.log(`Open ${new URL("/login", callback).href} to start browser sign-in.`);
  } else {
    console.log(`Use a signed iOS development build with bundle ID ${APPLE_NATIVE_CLIENT_ID} and Sign in with Apple enabled.`);
  }
  console.log("This checks local configuration. Complete a real Apple sign-in to verify Apple's key/app registration and the running backend.");
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : "Apple configuration could not be verified"}`);
  process.exitCode = 1;
}
