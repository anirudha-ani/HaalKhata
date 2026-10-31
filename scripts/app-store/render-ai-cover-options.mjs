/** Renders the original AI-first cover concepts from actual native UI and a fictional receipt. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const rootDirectory = resolve(import.meta.dirname, "../..");
const assetDirectory = resolve(rootDirectory, "apps/mobile/store/1.0.0/creative-v2");
const palette = { cream: "#faf6ef", ink: "#292217", terra: "#b03a25", pale: "#f0ded1", muted: "#746957" };
const width = 1320;
const height = 2868;

/** Wraps vector layout without generating or changing the app's UI.
 * @param {string} markup SVG content.
 * @returns {Buffer} Rasterizer input.
 */
function vector(markup) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${markup}</svg>`);
}

/** Formats one line of editorial text.
 * @param {string} content Plain text with no XML special characters.
 * @param {number} positionLeft Left coordinate.
 * @param {number} baseline Baseline coordinate.
 * @param {number} size Font size.
 * @param {string} color Text color.
 * @param {number} weight Font weight.
 * @returns {string} SVG text.
 */
function lettering(content, positionLeft, baseline, size, color = palette.ink, weight = 700) {
  return `<text x="${positionLeft}" y="${baseline}" fill="${color}" font-family="Helvetica Neue, Arial" font-size="${size}" font-weight="${weight}" letter-spacing="${size > 100 ? -5 : 0}">${content}</text>`;
}

/** Frames an unchanged native screenshot using a rounded mask.
 * @param {number} targetWidth Width of the native screen.
 * @returns {Promise<Buffer>} Screen image.
 */
async function screen(targetWidth) {
  const targetHeight = Math.round(targetWidth * 2868 / 1320);
  const mask = Buffer.from(`<svg width="${targetWidth}" height="${targetHeight}"><rect width="100%" height="100%" rx="72" fill="white"/></svg>`);
  return sharp(resolve(assetDirectory, "iphone-items-native.png")).resize(targetWidth).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

const icon = await sharp(resolve(rootDirectory, "apps/mobile/assets/icon.png")).resize(70).png().toBuffer();
const receipt = await readFile(resolve(assetDirectory, "california-receipt.png"));
const optionA = vector(`
  <rect width="100%" height="100%" fill="${palette.cream}"/>
  <circle cx="1130" cy="2150" r="1050" fill="${palette.pale}"/>
  ${lettering("HaalKhata", 174, 137, 49)}
  <rect x="90" y="217" width="403" height="65" rx="32" fill="${palette.terra}"/>
  ${lettering("AI RECEIPT SCANNING", 117, 260, 29, palette.cream)}
  ${lettering("Snap the bill.", 85, 444, 151)}
  ${lettering("Skip the typing.", 85, 618, 151, palette.terra)}
  ${lettering("AI reads the receipt.", 92, 718, 45, palette.muted, 400)}
  ${lettering("You choose who had what.", 92, 779, 45, palette.muted, 400)}
  ${lettering("01 / SNAP", 75, 1025, 31, palette.terra)}
  ${lettering("02 / PICK YOUR ITEMS", 520, 868, 31, palette.terra)}
  <rect x="444" y="902" width="816" height="1764" rx="85" fill="${palette.ink}"/>
  <path d="M125 2080 C70 2270 210 2360 390 2255 M350 2255 L390 2255 L377 2296" fill="none" stroke="${palette.terra}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  ${lettering("Dinner plans.", 74, 2470, 36)}
  ${lettering("Less admin.", 74, 2525, 36)}
  ${lettering("Shared expenses, made simple", 225, 2795, 41, palette.terra, 500)}
`);
const rotatedReceipt = await sharp(receipt).resize(570).rotate(-7, { background: "#00000000" }).png().toBuffer();
await sharp(optionA).composite([
  { input: icon, left: 90, top: 80 },
  { input: rotatedReceipt, left: 0, top: 1060 },
  { input: await screen(790), left: 457, top: 915 },
]).flatten({ background: palette.cream }).removeAlpha().png().toFile(resolve(assetDirectory, "cover-a-snap.png"));

const optionB = vector(`
  <rect width="100%" height="100%" fill="${palette.cream}"/>
  <path d="M0 0 H1320 V800 Q660 960 0 800Z" fill="${palette.terra}"/>
  ${lettering("HaalKhata", 174, 137, 49, palette.cream)}
  ${lettering("AI RECEIPT SCANNING", 90, 269, 31, palette.cream)}
  ${lettering("Your receipt.", 85, 448, 151, palette.cream)}
  ${lettering("Ready to split.", 85, 620, 151, palette.cream)}
  ${lettering("Scan with AI. Pick your items. Done.", 90, 728, 42, palette.cream, 400)}
  ${lettering("Items.", 600, 1045, 90)}
  ${lettering("Tax.", 600, 1157, 90)}
  ${lettering("Tip.", 600, 1269, 90)}
  ${lettering("Read by AI.", 600, 1390, 66, palette.terra)}
  ${lettering("Reviewed by you.", 600, 1452, 38, palette.muted, 400)}
  ${lettering("Everyone picks their part.", 90, 1590, 66)}
  <rect x="75" y="1630" width="1170" height="1106" rx="45" fill="${palette.pale}"/>
  ${lettering("Shared expenses, made simple", 225, 2795, 41, palette.terra, 500)}
`);
// This is a crop of the real native screenshot, not reconstructed interface text.
const itemCrop = await sharp(resolve(assetDirectory, "iphone-items-native.png"))
  .extract({ left: 18, top: 350, width: 1284, height: 1290 }).resize(1070).png().toBuffer();
await sharp(optionB).composite([
  { input: icon, left: 90, top: 80 },
  { input: await sharp(receipt).resize(450).png().toBuffer(), left: 50, top: 830 },
  { input: itemCrop, left: 125, top: 1645 },
]).flatten({ background: palette.cream }).removeAlpha().png().toFile(resolve(assetDirectory, "cover-b-ready.png"));

const previews = await Promise.all(["cover-a-snap.png", "cover-b-ready.png"].map(async filename => sharp(resolve(assetDirectory, filename)).resize(528).png().toBuffer()));
const previewHeight = Math.round(height * 528 / width);
await sharp({ create: { width: 1096, height: previewHeight + 72, channels: 3, background: palette.cream } }).composite([
  { input: Buffer.from(`<svg width="1096" height="72">${lettering("A · SNAP THE BILL", 25, 47, 25)}${lettering("B · READY TO SPLIT", 580, 47, 25)}</svg>`), left: 0, top: 0 },
  { input: previews[0], left: 0, top: 72 }, { input: previews[1], left: 568, top: 72 },
]).png().toFile(resolve(assetDirectory, "cover-options-preview.png"));
console.log("Rendered original cover concepts without the rejected repeated badge. The new visual direction remains pending.");
