/** Thin PushService Connect handlers; logic lives in the push usecases. */

import type { PlainServiceImpl } from "@/server/api/connect/wire/plainService";
import type { PushService } from "@haalkhata/protogen/push/v1/push_pb";
import { currentSessionId, requireUser, runUsecase, sessionTokenVersion } from "@/server/api/connect/context";
import { requireRateLimitedUser, RPC_RATE_LIMITS } from "@/server/api/connect/rateLimit/rpcRateLimit";
import * as devices from "@/server/push/usecase/devices/devices.usecase";
import * as preferences from "@/server/push/usecase/preferences/preferences.usecase";

/** PushService implementation; every method authenticates, then delegates. */
export const pushHandler: PlainServiceImpl<typeof PushService> = {
  /** Records this phone for the caller (native app only). */
  async registerDevice(request, context) {
    return runUsecase(
      async () =>
        devices.registerDevice(
          await requireRateLimitedUser(context, "register-device", RPC_RATE_LIMITS.registerDevice),
          { id: currentSessionId(context), version: sessionTokenVersion(context) },
          request,
        ),
      context,
    );
  },

  /** Lists the caller's phones. */
  async listDevices(_request, context) {
    return runUsecase(async () => devices.listDevices(await requireUser(context)), context);
  },

  /** Stops pushes to one of the caller's phones. */
  async removeDevice(request, context) {
    await runUsecase(
      async () => devices.removeDevice(await requireUser(context), request.deviceId, request.signingOut),
      context,
    );
    return {};
  },

  /** Sends one push to one of the caller's phones now. */
  async sendTestPush(request, context) {
    await runUsecase(
      async () =>
        devices.sendTestPush(
          await requireRateLimitedUser(context, "send-test-push", RPC_RATE_LIMITS.sendTestPush),
          request.deviceId,
        ),
      context,
    );
    return {};
  },

  /** Reads the caller's switches. */
  async getPreferences(_request, context) {
    return runUsecase(async () => preferences.getPreferences(await requireUser(context)), context);
  },

  /** Replaces the caller's switches. */
  async updatePreferences(request, context) {
    return runUsecase(
      async () =>
        preferences.updatePreferences(
          await requireRateLimitedUser(context, "update-push-preferences", RPC_RATE_LIMITS.updatePushPreferences),
          request,
        ),
      context,
    );
  },
};
