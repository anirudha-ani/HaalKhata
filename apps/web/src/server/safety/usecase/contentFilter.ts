/** Server-side prepublication filter for shared user text. */

import { invalid } from "@/server/common/errors";
import { ABUSIVE_TEXT_PATTERN, MAX_FILTER_TEXT_LENGTH } from "../safety.constants";

/**
 * Rejects known abusive phrases before user text enters shared content.
 * @param text User-provided text.
 */
export function assertSafeText(text: string): void {
  if (text.length > MAX_FILTER_TEXT_LENGTH || ABUSIVE_TEXT_PATTERN.test(text.normalize("NFKC"))) {
    invalid("Please remove abusive or threatening language before sharing this text.");
  }
}
