/** Abuse limits on sending verification SMS: per destination and per client, not only per account. */

import { Code, ConnectError } from "@connectrpc/connect";
import { rateLimitCheck } from "@/server/common/rateLimit";
import { signPayload } from "@/server/auth/usecase/auth.usecase";
import {
  DAY_MS,
  HOUR_MS,
  PHONE_SEND_LIMIT_PER_DESTINATION_DAY,
  PHONE_SEND_LIMIT_PER_DESTINATION_HOUR,
  PHONE_SEND_LIMIT_PER_IP_HOUR,
} from "@/server/auth/auth.constants";

/**
 * Refuses an SMS send that would exceed the per-destination or per-client
 * ceilings.
 *
 * The per-account limit alone lets anyone with several accounts point every
 * one of them at the same victim number — harassment, and provider cost
 * (SMS pumping). Twilio's own guidance is to limit by destination number
 * and by IP as well as by user, so both are keyed here: a number may be
 * sent to a few times an hour and a handful of times a day, whoever asks,
 * and one client address may start only so many verifications an hour.
 *
 * The destination is keyed by a keyed hash, not the number: the limiter is
 * in memory only, but a raw phone number has no business being in any
 * process state or diagnostic output it does not need to be in.
 *
 * @param phone - Normalized E.164 destination.
 * @param clientAddress - The caller's IP, as resolved for the login limiter.
 * @throws ConnectError ResourceExhausted when any ceiling is reached.
 */
export function enforcePhoneSendLimits(phone: string, clientAddress: string): void {
  const destination = signPayload("rate-limit", phone);
  const allowed =
    rateLimitCheck(`phone:dest:hour:${destination}`, PHONE_SEND_LIMIT_PER_DESTINATION_HOUR, HOUR_MS) &&
    rateLimitCheck(`phone:dest:day:${destination}`, PHONE_SEND_LIMIT_PER_DESTINATION_DAY, DAY_MS) &&
    rateLimitCheck(`phone:ip:hour:${clientAddress}`, PHONE_SEND_LIMIT_PER_IP_HOUR, HOUR_MS);
  if (!allowed) {
    throw new ConnectError(
      "too many verification messages for that number right now — try again later",
      Code.ResourceExhausted,
    );
  }
}
