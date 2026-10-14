/** Native iOS Apple login and verifier-bound browser login for Android. */

import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authClient, errorMessage } from "@/lib/api/connect";
import { setSessionToken } from "@/lib/api/session";
import { clearMobileQueryCache } from "@/lib/api/queryCache";
import { consumePendingInvite } from "@/lib/invite/consumePendingInvite";
import { useSignInOptionsAPI } from "./useSignInOptionsAPI";

/**
 * Drives Apple login without placing identity or local bearer tokens in redirect URLs.
 * @returns Availability, pending/error state, and sign-in action.
 */
export function useAppleSignIn() {
  const router = useRouter();
  const options = useSignInOptionsAPI();
  const [deviceSupported, setDeviceSupported] = useState<boolean | null>(Platform.OS === "ios" ? null : Platform.OS === "android");
  const available = deviceSupported === true && options.isSuccess &&
    (Platform.OS === "ios" ? options.data.appleNativeEnabled : options.data.appleBrowserEnabled);
  const [error, setError] = useState("");
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let mounted = true;
    void AppleAuthentication.isAvailableAsync().then((supported) => { if (mounted) setDeviceSupported(supported); })
      .catch(() => { if (mounted) setDeviceSupported(false); });
    return () => { mounted = false; };
  }, []);
  const mutation = useMutation({
    mutationFn: async () => {
      if (Platform.OS === "ios") {
        const challenge = await authClient.beginAppleSignIn({ mobile: true });
        const credential = await AppleAuthentication.signInAsync({ nonce: challenge.nonce,
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME] });
        if (!credential.identityToken || !credential.authorizationCode) throw new Error("Apple did not return sign-in credentials");
        return authClient.logInWithApple({ idToken: credential.identityToken, authorizationCode: credential.authorizationCode,
          name: credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : "" });
      }
      // 32 random bytes in canonical base64url, kept only in this attempt's memory.
      const verifier = btoa(String.fromCharCode(...Crypto.getRandomBytes(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const verifierHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier);
      const challenge = await authClient.beginAppleSignIn({ browserFlow: true, mobile: true, verifierHash });
      const browserResult = await WebBrowser.openAuthSessionAsync(challenge.authorizationUrl, "haalkhata://login");
      if (browserResult.type !== "success") return null;
      const callback = new URL(browserResult.url);
      if (callback.searchParams.get("apple_error") === "cancelled") return null;
      if (callback.searchParams.has("apple_error")) throw new Error("Apple sign-in could not finish. Please try again.");
      return authClient.completeAppleSignIn({ state: callback.searchParams.get("apple_sign_in") ?? "", verifier });
    },
    onSuccess: async (result) => {
      if (!result) return;
      await clearMobileQueryCache();
      await setSessionToken(result.token);
      router.replace(await consumePendingInvite());
    },
    onError: (failure) => {
      if ((failure as { code?: string }).code !== "ERR_REQUEST_CANCELED") setError(errorMessage(failure));
    },
  });
  return { available, error, isLoading: options.isPending || deviceSupported === null, isPending: mutation.isPending,
    /** Clears a previous error and starts a fresh Apple authorization. */
    signIn: () => { if (available && !mutation.isPending) { setError(""); mutation.mutate(); } } };
}
