/** The activity glyph registry: every drawing, keyed by the name an event look refers to. */

import { ShockedReceiptGlyph } from "../components/ShockedReceiptGlyph/ShockedReceiptGlyph";
import { SideEyeGlyph } from "../components/SideEyeGlyph/SideEyeGlyph";
import { SkullGlyph } from "../components/SkullGlyph/SkullGlyph";
import { CashGrinGlyph } from "../components/CashGrinGlyph/CashGrinGlyph";
import { WingedCoinGlyph } from "../components/WingedCoinGlyph/WingedCoinGlyph";
import { BuddiesGlyph } from "../components/BuddiesGlyph/BuddiesGlyph";
import { PartyHatGlyph } from "../components/PartyHatGlyph/PartyHatGlyph";
import { YappingGlyph } from "../components/YappingGlyph/YappingGlyph";
import { BlankGlyph } from "../components/BlankGlyph/BlankGlyph";
import type { GlyphName } from "../ActivityGlyph";

/** Every glyph, keyed by name. */
export const GLYPHS: Record<GlyphName, () => React.JSX.Element> = {
  shockedReceipt: ShockedReceiptGlyph,
  sideEye: SideEyeGlyph,
  skull: SkullGlyph,
  cashGrin: CashGrinGlyph,
  wingedCoin: WingedCoinGlyph,
  buddies: BuddiesGlyph,
  partyHat: PartyHatGlyph,
  yapping: YappingGlyph,
  blank: BlankGlyph,
};
