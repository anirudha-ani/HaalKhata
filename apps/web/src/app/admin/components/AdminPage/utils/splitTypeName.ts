/** Names a split type for the usage page. */

import { SPLIT_TYPE_WORDING } from "../constants/adminPage";

/**
 * What a split type is called on the usage page, e.g. "Exact amounts".
 *
 * Not the expense form's tab labels ("Equally", "Amounts"): those complete
 * the sentence "Split: ...", and read wrongly as the name of a kind of
 * expense in a table or a filter.
 *
 * @param splitType - A split type key such as "itemized".
 * @returns Its name, or the key itself for one this build does not know.
 */
export function splitTypeName(splitType: string): string {
  return SPLIT_TYPE_WORDING[splitType]?.name ?? splitType;
}
