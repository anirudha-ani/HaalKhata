/** Made-up address-book rows drawn above the find-friends step. */

import { colors } from "@/lib/theme/theme";

/** Address-book rows drawn above the find-friends step; two of them are on HaalKhata. */
export const CONTACTS_ART_ROWS = [
  { id: "art-oni", name: "Oni Nakamura", avatarColor: colors.brand600, onHaalKhata: true },
  { id: "art-sam", name: "Sam Rahman", avatarColor: colors.inkSoft, onHaalKhata: false },
  { id: "art-dot", name: "Dot Okafor", avatarColor: colors.pos600, onHaalKhata: true },
] as const;
