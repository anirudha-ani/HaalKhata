/** Names the device a request came from, the way its client carries a session. */

import { SESSION_DEVICE_HEADER } from "@haalkhata/shared/auth/sessionRenewal";
import { appLabel, browserLabel, type DeviceDescription } from "@/server/auth/usecase/session/deviceLabel";
import { wantsBearerToken } from "./credentials";

/**
 * Describes a request's device for the list of sign-ins: the phone app names
 * itself, and a browser is read from its User-Agent.
 *
 * @param headers - The request's headers.
 * @returns What to store.
 */
export function describeDevice(headers: Headers): DeviceDescription {
  const isApp = wantsBearerToken(headers);
  return isApp
    ? { label: appLabel(headers.get(SESSION_DEVICE_HEADER)), isApp }
    : { label: browserLabel(headers.get("user-agent")), isApp };
}
