/** Safety validation and filtering bounds. */

/** Limits automated submissions without obstructing a legitimate report. */
export const SAFETY_WRITE_LIMIT = 10;
/** Maximum input scanned by the text filter. */
export const MAX_FILTER_TEXT_LENGTH = 10000;
/** Bounded whole-token matches; normalize compatibility forms before matching. */
export const ABUSIVE_TEXT_PATTERN = /(?:^|[^\p{L}\p{N}])(?:nigger|faggot|kill yourself|rape you)(?=$|[^\p{L}\p{N}])/iu;
