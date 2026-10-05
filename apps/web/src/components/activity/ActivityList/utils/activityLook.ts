/** Picks how one activity event is drawn, which for a settlement depends on who is reading. */

import {
  ACTIVITY_LOOK,
  INBOUND_LOOK,
  OUTBOUND_LOOK,
  UNKNOWN_LOOK,
  type ActivityLook,
} from "../constants/activityLooks";

/**
 * Picks the look for one event.
 *
 * Settlements are the reason this is a function rather than a lookup: the
 * same stored row is money in for one reader and money out for the other, so
 * a single stored glyph would be wrong for one of them.
 *
 * @param type - Event kind from the server.
 * @param inbound - Whether this event moved money toward the reader.
 * @returns The glyph, tile classes, caption and accessible label to draw.
 */
export function activityLook(type: string, inbound: boolean): ActivityLook {
  if (type === "settlement") return inbound ? INBOUND_LOOK : OUTBOUND_LOOK;
  return ACTIVITY_LOOK[type] ?? UNKNOWN_LOOK;
}
