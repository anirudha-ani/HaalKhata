/** Short excerpts of user-entered labels, so a label cannot consume an entire notification. */

import { NOTIFICATION_LABEL_MAX_LENGTH } from "@/server/social/social.constants";

/**
 * Excerpts a bill or group name without breaking an emoji.
 * The actor's own title keeps their full name. Only labels are excerpted;
 * action words, amounts and the rest of the composed message remain intact.
 *
 * @param label - A user-entered display label.
 * @returns A single-line excerpt, marked when more text is available on tap.
 */
export function notificationLabel(label: string): string {
  const normalized = label.replace(/\s+/gu, " ").trim();
  if ([...normalized].length <= NOTIFICATION_LABEL_MAX_LENGTH) return normalized;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let excerpt = "";
  let length = 0;
  for (const { segment } of segmenter.segment(normalized)) {
    const segmentLength = [...segment].length;
    if (length + segmentLength >= NOTIFICATION_LABEL_MAX_LENGTH) break;
    excerpt += segment;
    length += segmentLength;
  }
  return `${excerpt.trimEnd()}…`;
}
