/** Which push delivery provider this process uses, and whether that configuration is safe to run. */

import { readSecret } from "@/server/common/secrets/secrets";
import { PUSH_PROVIDERS } from "@/server/push/push.constants";
import { expoPushProvider } from "@/server/push/usecase/provider/expoPush.provider";
import { logPushProvider } from "@/server/push/usecase/provider/logPush.provider";
import type { PushProvider } from "@/server/push/usecase/provider/pushTypes";

/** A configured provider name. */
export type PushProviderName = (typeof PUSH_PROVIDERS)[number];

/**
 * The provider this process is configured with: PUSH_PROVIDER, defaulting to
 * Expo in production and to the log provider everywhere else.
 *
 * @returns The provider name, or the raw value when it names none.
 */
export function configuredPushProvider(): string {
  const configured = process.env.PUSH_PROVIDER?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "expo" : "log";
}

/**
 * Refuses a configuration that would send nothing in production: the log
 * provider there means pushes that silently go nowhere, which is worse than
 * a failed readiness check. With Expo, the access token must be present,
 * because enhanced push security refuses unauthenticated sends.
 *
 * @throws Error naming the misconfiguration, for the log only.
 */
export function assertPushConfigured(): void {
  const provider = configuredPushProvider();
  if (!(PUSH_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`push is misconfigured: PUSH_PROVIDER=${provider} is not one of ${PUSH_PROVIDERS.join(", ")}`);
  }
  if (process.env.NODE_ENV !== "production") return;
  if (provider !== "expo") {
    throw new Error("push is misconfigured: production must use PUSH_PROVIDER=expo");
  }
  if (!readSecret("EXPO_ACCESS_TOKEN")) {
    throw new Error("push is not configured: EXPO_ACCESS_TOKEN is unset");
  }
}

/**
 * The provider instance for this process.
 *
 * @returns Expo or the log provider, per {@link configuredPushProvider}.
 */
export function pushProvider(): PushProvider {
  return configuredPushProvider() === "expo" ? expoPushProvider() : logPushProvider;
}
