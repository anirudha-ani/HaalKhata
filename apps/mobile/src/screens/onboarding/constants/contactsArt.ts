/** Made-up address-book rows drawn above the find-friends step. */

import { colors } from "@/lib/theme/theme";

/** Address-book rows drawn above the find-friends step; two of them are on HaalKhata. */
export const CONTACTS_ART_ROWS = [
  { id: "art-oni", name: "Anirudha Paul", avatarColor: colors.brand600, onHaalKhata: true },
  { id: "art-muskaan", name: "Muskaan Patel", avatarColor: colors.inkSoft, onHaalKhata: false },
  { id: "art-dot", name: "Aditya Dot", avatarColor: colors.pos600, onHaalKhata: true },
] as const;
