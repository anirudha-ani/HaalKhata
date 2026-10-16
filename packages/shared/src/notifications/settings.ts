/** Pure helpers behind the Notifications card in both apps: switch edits and how a phone is described. */

import { localDate, localDateTime } from "../time/localTime";
import type { PushCategory, PushPreferenceValues } from "./categories";
import { PUSH_COPY } from "./copy";

/** The fields of a PushService Device the card shows. */
export interface PushDeviceSummary {
  platform: string;
  label: string;
  lastSeenAt: string;
  lastSentAt: string;
}

/**
 * Picks exactly the five switches out of anything that carries them, such as
 * a generated PushPreferences message.
 *
 * @param source - The switches, with or without other fields.
 * @returns A plain record of the five switches.
 */
export function toPushPreferenceValues(source: PushPreferenceValues): PushPreferenceValues {
  return {
    expenses: source.expenses,
    comments: source.comments,
    payments: source.payments,
    groups: source.groups,
    friends: source.friends,
  };
}

/**
 * The whole record with one switch changed — what UpdatePreferences is sent,
 * since it replaces the record rather than patching it.
 *
 * @param current - The switches as last stored.
 * @param category - The switch being flipped.
 * @param enabled - Its new state.
 * @returns The record to send.
 */
export function withPushSwitch(
  current: PushPreferenceValues,
  category: PushCategory,
  enabled: boolean,
): PushPreferenceValues {
  return { ...toPushPreferenceValues(current), [category]: enabled };
}

/**
 * How one phone is named and described in the list of phones.
 *
 * @param device - The phone.
 * @param nowTime - The current time, injectable for tests.
 * @returns Its name, and a line with when it was last opened and last notified.
 */
export function describePushDevice(
  device: PushDeviceSummary,
  nowTime: Date = new Date(),
): { name: string; detail: string } {
  const name = device.label || (device.platform === "android" ? "Android phone" : "iPhone");
  const seen = localDate(device.lastSeenAt, nowTime);
  const sent = device.lastSentAt ? localDateTime(device.lastSentAt, nowTime) : PUSH_COPY.never;
  return { name, detail: `${PUSH_COPY.lastSeen} ${seen} · ${PUSH_COPY.lastSent} ${sent}` };
}
