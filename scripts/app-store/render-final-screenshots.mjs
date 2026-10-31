/** Renders the superseded v2 cream and terracotta App Store draft family around real native captures. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, readFile, copyFile } from "node:fs/promises";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const rootDirectory = resolve(import.meta.dirname, "../..");
const storeDirectory = resolve(rootDirectory, "apps/mobile/store/1.0.0");
const creativeDirectory = resolve(storeDirectory, "creative-v2");
const metadata = JSON.parse(await readFile(resolve(storeDirectory, "metadata.json"), "utf8"));
const palette = { cream: "#faf6ef", ink: "#292217", terra: "#b03a25", pale: "#f0ded1", muted: "#746957" };
const labels = { itemized: "PICK YOUR ITEMS", live: "SPLIT LIVE", "tax-tip": "THE MATH, HANDLED", groups: "YOUR PEOPLE. YOUR PLANS.", balances: "EVERYONE KNOWS THEIR SHARE" };
const families = [{ key: "iphone", width: 1320, height: 2868, nativeWidth: 1320, nativeHeight: 2868 }, { key: "ipad", width: 2064, height: 2752, nativeWidth: 2048, nativeHeight: 2732 }];

/** Escapes text for SVG. @param {string} value Text. @returns {string} XML-safe text. */
function escape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
/** Creates one line of display type. @param {string} content Text. @param {number} left Left edge. @param {number} baseline Baseline. @param {number} size Font size. @param {string} color Color. @param {number} weight Weight. @returns {string} SVG. */
function lettering(content, left, baseline, size, color = palette.ink, weight = 700) {
  return `<text x="${left}" y="${baseline}" fill="${color}" font-family="Helvetica Neue, Arial" font-size="${size}" font-weight="${weight}" letter-spacing="${size > 100 ? -4 : 0}">${escape(content)}</text>`;
}
/** Wraps a vector layout. @param {object} family Canvas. @param {string} content Markup. @returns {Buffer} Rasterizer input. */
function vector(family, content) { return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${family.width}" height="${family.height}">${content}</svg>`); }
/** Rounds a native screen without changing its content. @param {string} file Native capture. @param {number} width Output width. @param {number} radius Corner radius. @returns {Promise<Buffer>} Image. */
async function screen(file, width, radius) {
  const information = await sharp(file).metadata();
  const height = Math.round(width * information.height / information.width);
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" rx="${radius}" fill="white"/></svg>`);
  return sharp(file).resize(width).composite([{input: mask, blend: "dest-in"}]).png().toBuffer();
}
/** Renders a device-specific feature image. @param {object} family Canvas. @param {object} feature Caption. @param {number} index Sequence. @returns {Promise<void>} Saved image. */
async function featureImage(family, feature, index) {
  const tablet = family.key === "ipad";
  const left = tablet ? 120 : 90;
  const screenWidth = tablet ? 1490 : 900;
  const screenHeight = Math.round(screenWidth * family.nativeHeight / family.nativeWidth);
  const screenLeft = Math.round((family.width - screenWidth) / 2);
  const screenTop = tablet ? 670 : 805;
  const titleSize = tablet ? 146 : (feature.title.some(line => line.length > 16) ? 120 : 141);
  const background = vector(family, `
    <rect width="100%" height="100%" fill="${palette.cream}"/>
    <ellipse cx="${family.width * 0.8}" cy="${family.height * 0.83}" rx="${family.width * 0.9}" ry="${family.height * 0.56}" fill="${palette.pale}"/>
    ${lettering("HaalKhata", left+84, 137, 49)}
    ${lettering(labels[feature.key], left, tablet ? 238 : 260, 29, palette.terra)}
    ${lettering(feature.title[0], left-4, tablet ? 405 : 440, titleSize)}
    ${lettering(feature.title[1], left-4, tablet ? 560 : 610, titleSize, palette.terra)}
    ${lettering(feature.detail, left, tablet ? 629 : 710, tablet ? 43 : 40, palette.muted, 400)}
    <rect x="${screenLeft-13}" y="${screenTop-13}" width="${screenWidth+26}" height="${screenHeight+26}" rx="${tablet ? 47 : 85}" fill="${palette.ink}"/>
    ${lettering(String(index+1).padStart(2,"0"), left, family.height-42, 28, palette.terra, 500)}
  `);
  const icon = await sharp(resolve(rootDirectory,"apps/mobile/assets/icon.png")).resize(70).png().toBuffer();
  await sharp(background).composite([
    { input: icon, left, top: 80 },
    { input: await screen(resolve(creativeDirectory,"native",family.key,`${feature.key}.png`), screenWidth, tablet ? 34 : 72), left: screenLeft, top: screenTop },
  ]).flatten({background:palette.cream}).removeAlpha().png().toFile(resolve(creativeDirectory,"final",family.key,`${String(index+1).padStart(2,"0")}-${feature.key}.png`));
}
/** Adapts the approved receipt-and-native-screen cover to iPad. @param {object} family iPad canvas. @returns {Promise<void>} Saved cover. */
async function tabletCover(family) {
  const screenWidth = 1430;
  const screenHeight = Math.round(screenWidth * family.nativeHeight / family.nativeWidth);
  const background = vector(family, `
    <rect width="100%" height="100%" fill="${palette.cream}"/>
    <circle cx="1770" cy="2180" r="1430" fill="${palette.pale}"/>
    ${lettering("HaalKhata",204,137,49)}
    <rect x="120" y="215" width="403" height="65" rx="32" fill="${palette.terra}"/>
    ${lettering("AI RECEIPT SCANNING",147,258,29,palette.cream)}
    ${lettering("Snap the bill.",116,440,164)}
    ${lettering("Skip the typing.",116,620,164,palette.terra)}
    ${lettering("AI reads the receipt. You choose who had what.",120,710,49,palette.muted,400)}
    ${lettering("01 / SNAP",70,1005,31,palette.terra)}
    <rect x="557" y="787" width="1456" height="${screenHeight+26}" rx="47" fill="${palette.ink}"/>
    <path d="M125 2120 C70 2310 270 2370 480 2245 M440 2245 L480 2245 L467 2286" fill="none" stroke="${palette.terra}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    ${lettering("Dinner plans.",74,2480,45)}
    ${lettering("Less admin.",74,2545,45)}
  `);
  const icon=await sharp(resolve(rootDirectory,"apps/mobile/assets/icon.png")).resize(70).png().toBuffer();
  const receipt=await sharp(resolve(creativeDirectory,"california-receipt.png")).resize(620).rotate(-7,{background:"#00000000"}).png().toBuffer();
  await sharp(background).composite([
    {input:icon,left:120,top:80},
    {input:receipt,left:0,top:1040},
    {input:await screen(resolve(creativeDirectory,"native/ipad/itemized.png"),screenWidth,34),left:570,top:800},
  ]).flatten({background:palette.cream}).removeAlpha().png().toFile(resolve(creativeDirectory,"final/ipad/01-ai.png"));
}
for (const family of families) {
  await mkdir(resolve(creativeDirectory,"final",family.key),{recursive:true});
  if (family.key === "iphone") await copyFile(resolve(creativeDirectory,"cover-a-snap.png"),resolve(creativeDirectory,"final/iphone/01-ai.png"));
  else await tabletCover(family);
  for (const [index,feature] of metadata.screenshots.entries()) if(index > 0) await featureImage(family,feature,index);
  const thumbs=[];
  const thumbWidth=family.key === "iphone" ? 330 : 420;
  const thumbHeight=Math.round(thumbWidth*family.height/family.width);
  for (const [index,feature] of metadata.screenshots.entries()) thumbs.push({input:await sharp(resolve(creativeDirectory,"final",family.key,`${String(index+1).padStart(2,"0")}-${feature.key}.png`)).resize(thumbWidth).png().toBuffer(),left:(index%3)*(thumbWidth+20),top:Math.floor(index/3)*(thumbHeight+20)});
  await sharp({create:{width:3*thumbWidth+40,height:2*thumbHeight+20,channels:3,background:palette.cream}}).composite(thumbs).png().toFile(resolve(creativeDirectory,`${family.key}-final-preview.png`));
  console.log(`Rendered 6 ${family.key} screenshots at ${family.width}x${family.height}.`);
}

// Apple's current required iPhone slot is Dynamic Island medium (1206 x 2622).
// Export the approved composition with uniform scaling and a sub-pixel cream edge.
await mkdir(resolve(creativeDirectory,"final/iphone-medium"), {recursive:true});
for (const [index,feature] of metadata.screenshots.entries()) {
  const filename=`${String(index+1).padStart(2,"0")}-${feature.key}.png`;
  await sharp(resolve(creativeDirectory,"final/iphone",filename)).resize(1206,2622,{fit:"contain",background:palette.cream}).removeAlpha().png().toFile(resolve(creativeDirectory,"final/iphone-medium",filename));
}
console.log("Rendered 6 required medium-display iPhone exports at 1206x2622.");
