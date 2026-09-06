/** Durable abuse ceilings on verification-SMS sends: per destination and per client, not only per account. */

import { Code, ConnectError } from "@connectrpc/connect";
import { recordPhoneSend } from "@/server/auth/repo/phoneVerifications.repo";
import { signPayload } from "@/server/auth/usecase/auth.usecase";
import {
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
 * The ledger lives in Postgres (phone_send_events), not process memory: a
 * ceiling that resets on every deploy, or that a second replica cannot see,
 * is not a ceiling. The send is recorded BEFORE the ceilings are judged, so
 * two racing sends can over-refuse by one but never slip under the count —
 * that failure mode lands on the abuser, not the victim.
 *
 * The destination is keyed by a keyed hash, not the number: a raw phone
 * number has no business being in any table or diagnostic output that does
 * not need it.
 *
 * @param phone - Normalized E.164 destination.
 * @param clientAddress - The caller's IP, as resolved for the login limiter.
 * @throws ConnectError ResourceExhausted when any ceiling is reached.
 */
export async function enforcePhoneSendLimits(
  phone: string,
  clientAddress: string,
): Promise<void> {
  const counts = await recordPhoneSend(signPayload("rate-limit", phone), clientAddress);
  const allowed =
    counts.destinationHour <= PHONE_SEND_LIMIT_PER_DESTINATION_HOUR &&
    counts.destinationDay <= PHONE_SEND_LIMIT_PER_DESTINATION_DAY &&
    counts.ipHour <= PHONE_SEND_LIMIT_PER_IP_HOUR;
  if (!allowed) {
    throw new ConnectError(
      "too many verification messages for that number right now — try again later",
      Code.ResourceExhausted,
    );
  }
}
