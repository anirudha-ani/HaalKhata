/** Renders three unapproved screenshot directions using unchanged native UI crops. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const rootDirectory = resolve(import.meta.dirname, "../..");
const creativeDirectory = resolve(rootDirectory, "apps/mobile/store/1.0.0/creative-v2");
const outputDirectory = resolve(creativeDirectory, "research-directions");
const palette = { cream: "#faf6ef", paper: "#fffdf9", ink: "#292217", terra: "#b03a25", pink: "#f0ded1", muted: "#746957" };
const canvas = { width: 660, height: 1434 };
const copy = [
  { label: "AI RECEIPT SCANNING", title: ["Snap the bill.", "Skip the typing."], detail: "AI reads the receipt. You choose the split." },
  { label: "PICK YOUR ITEMS", title: ["Your meal.", "Your share."], detail: "Pick your items. Share the dessert." },
  { label: "SPLIT LIVE", title: ["One bill.", "Everyone joins in."], detail: "Friends open the link and pick their items." },
];
const titles = { a: "A  /  BOLD PRODUCT STORY", b: "B  /  CLEAN APP SHOWCASE", c: "C  /  WARM DINNER STORY" };

/** Escapes literal text for SVG. @param {string} value Text. @returns {string} Escaped text. */
function escape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;"); }
/** Builds typography. @param {string} value Text. @param {number} left X. @param {number} baseline Y. @param {number} size Size. @param {string} color Color. @param {string} family Typeface. @param {number} weight Weight. @returns {string} SVG. */
function text(value, left, baseline, size, color = palette.ink, family = "Helvetica Neue, Arial", weight = 700) {
  return `<text x="${left}" y="${baseline}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${size >= 55 ? -2 : 0}" fill="${color}">${escape(value)}</text>`;
}
/** Wraps SVG content. @param {string} content Markup. @param {number} width Width. @param {number} height Height. @returns {Buffer} SVG. */
function vector(content, width = canvas.width, height = canvas.height) { return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`); }
/** Creates rounded raster edges. @param {Buffer} input Pixels. @param {number} radius Radius. @returns {Promise<Buffer>} Rounded image. */
async function round(input, radius) {
  const information = await sharp(input).metadata();
  return sharp(input).composite([{ input: vector(`<rect width="100%" height="100%" rx="${radius}" fill="white"/>`, information.width, information.height), blend: "dest-in" }]).png().toBuffer();
}
/** Takes a faithful crop from a native capture. @param {string} name Capture. @param {object|null} region Crop. @param {number} width Width. @param {number} radius Radius. @returns {Promise<Buffer>} Native pixels. */
async function capture(name, region, width, radius = 22) {
  let pipeline = sharp(resolve(creativeDirectory, "native/iphone", `${name}.png`));
  if (region) pipeline = pipeline.extract(region);
  return round(await pipeline.resize(width).png().toBuffer(), radius);
}
/** Prepares the fictional receipt illustration. @param {number} width Width. @param {number} angle Rotation. @returns {Promise<Buffer>} Receipt. */
async function receipt(width, angle = 0) {
  return sharp(resolve(creativeDirectory, "california-receipt.png")).trim().resize(width).rotate(angle, { background: "#00000000" }).png().toBuffer();
}
/** Writes one concept. @param {string} direction Direction. @param {number} index Slide. @param {string} background Markup. @param {Array<object>} layers Image layers. @returns {Promise<void>} Saved draft. */
async function save(direction, index, background, layers) {
  await sharp(vector(background)).composite(layers).flatten({ background: palette.cream }).removeAlpha().png().toFile(resolve(outputDirectory, `${direction}-${index + 1}.png`));
}
/** Draws a minimal arrow between receipt and native result. @param {string} color Stroke. @returns {string} SVG. */
function arrow(color) { return `<path d="M330 784 V824 M316 810 L330 824 L344 810" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`; }

await mkdir(outputDirectory, { recursive: true });
const itemPair = { left: 46, top: 546, width: 1228, height: 1076 };
const dessertPair = { left: 46, top: 1660, width: 1228, height: 1077 };
const liveSection = { left: 46, top: 606, width: 1228, height: 444 };
const shareSection = { left: 46, top: 1650, width: 1228, height: 467 };

for (const [index, slide] of copy.entries()) {
  const dark = index !== 1;
  const backgroundColor = dark ? palette.terra : palette.cream;
  const foreground = dark ? palette.cream : palette.ink;
  let background = `<rect width="100%" height="100%" fill="${backgroundColor}"/>`;
  background += text(index === 0 ? "HaalKhata" : slide.label, 42, 64, 20, foreground);
  background += text(slide.title[0], 40, 177, 66, foreground);
  background += text(slide.title[1], 40, 254, index === 2 ? 59 : 66, foreground);
  background += text(slide.detail, 43, 312, 23, foreground, "Helvetica Neue, Arial", 400);
  const layers = [];
  if (index === 0) {
    background += text("AI RECEIPT SCANNING", 42, 376, 18, foreground);
    background += arrow(palette.cream);
    background += `<rect x="34" y="855" width="592" height="534" rx="28" fill="${palette.paper}"/>`;
    layers.push({ input: await receipt(174, -6), left: 234, top: 410 });
    layers.push({ input: await capture("itemized", itemPair, 568), left: 46, top: 870 });
  } else if (index === 1) {
    background += `<circle cx="610" cy="1040" r="450" fill="${palette.pink}"/>`;
    background += text("Pasta for Pezanne.", 43, 447, 29);
    background += text("Dessert for everyone.", 43, 489, 29, palette.terra);
    layers.push({ input: await capture("itemized", dessertPair, 580), left: 40, top: 548 });
    background += text("Tap a name. Make it theirs.", 43, 1172, 29, palette.terra);
    background += text("Tax and tip follow each person’s items.", 43, 1217, 23, palette.muted, "Helvetica Neue, Arial", 400);
  } else {
    background += text("A shared bill, on everyone’s phone.", 43, 469, 27, foreground);
    layers.push({ input: await capture("live", liveSection, 580), left: 40, top: 524 });
    background += text("Everyone can see their share.", 43, 874, 28, foreground);
    layers.push({ input: await capture("live", shareSection, 580), left: 40, top: 927 });
    background += text("Dinner in San Francisco · $108.15", 43, 1306, 23, foreground, "Helvetica Neue, Arial", 400);
  }
  await save("a", index, background, layers);
}

for (const [index, slide] of copy.entries()) {
  let background = `<rect width="100%" height="100%" fill="${palette.cream}"/><circle cx="330" cy="1180" r="580" fill="${palette.pink}"/>`;
  background += text(index === 0 ? "HaalKhata" : slide.label, 44, 65, 20, palette.terra);
  background += text(slide.title[0], 42, 187, 65);
  background += text(slide.title[1], 42, 266, index === 2 ? 59 : 65, palette.terra);
  background += text(slide.detail, 44, 326, 23, palette.muted, "Helvetica Neue, Arial", 400);
  const screenWidth = index === 0 ? 400 : 444;
  const screenLeft = index === 0 ? 218 : 108;
  const screenTop = index === 0 ? 515 : 430;
  const screenHeight = Math.round(screenWidth * 2868 / 1320);
  background += `<rect x="${screenLeft-6}" y="${screenTop-6}" width="${screenWidth+12}" height="${screenHeight+12}" rx="43" fill="${palette.ink}"/>`;
  const layers = [{ input: await capture(index === 2 ? "live" : "itemized", null, screenWidth, 37), left: screenLeft, top: screenTop }];
  if (index === 0) {
    background += text("AI reads it.", 44, 444, 26, palette.terra);
    layers.unshift({ input: await receipt(165, -5), left: 26, top: 505 });
  }
  await save("b", index, background, layers);
}

for (const [index, slide] of copy.entries()) {
  const serif = "Georgia";
  let background = `<rect width="100%" height="100%" fill="${palette.cream}"/><rect x="24" y="24" width="612" height="1386" rx="8" fill="none" stroke="${palette.terra}" stroke-width="1.5"/>`;
  background += text(index === 0 ? "HaalKhata  /  DINNER IN SF" : slide.label, 47, 72, 18, palette.terra);
  background += `<path d="M47 95 H613" stroke="${palette.terra}" stroke-width="1"/>`;
  background += text(slide.title[0], 43, 192, 63, palette.ink, serif);
  background += text(slide.title[1], 43, 270, index === 2 ? 55 : 63, palette.terra, serif);
  background += text(slide.detail, 47, 330, 23, palette.muted, "Helvetica Neue, Arial", 400);
  const layers = [];
  if (index === 0) {
    background += text("The check is here.", 46, 424, 29, palette.ink, serif);
    layers.push({ input: await receipt(174, 7), left: 233, top: 446 });
    background += text("AI turns it into items to split.", 47, 877, 29, palette.terra, serif);
    layers.push({ input: await capture("itemized", itemPair, 558), left: 51, top: 915 });
  } else if (index === 1) {
    background += text("Pasta for Pezanne.", 47, 457, 33, palette.ink, serif);
    background += text("Dessert for everyone.", 47, 502, 33, palette.terra, serif);
    layers.push({ input: await capture("itemized", dessertPair, 558), left: 51, top: 568 });
    background += text("Because fair doesn’t always mean equal.", 47, 1215, 24, palette.muted, "Helvetica Neue, Arial", 400);
  } else {
    background += text("Pass the link around.", 47, 466, 34, palette.ink, serif);
    layers.push({ input: await capture("live", liveSection, 558), left: 51, top: 523 });
    background += text("Everyone finds their share.", 47, 872, 32, palette.terra, serif);
    layers.push({ input: await capture("live", shareSection, 558), left: 51, top: 926 });
    background += text("Oni, Aditya, Pezanne. One dinner sorted.", 47, 1310, 24, palette.muted, "Helvetica Neue, Arial", 400);
  }
  await save("c", index, background, layers);
}

for (const direction of Object.keys(titles)) {
  const previewWidth = 396;
  const previewHeight = Math.round(canvas.height * previewWidth / canvas.width);
  const layers = [];
  for (let index = 0; index < 3; index += 1) {
    layers.push({ input: await sharp(resolve(outputDirectory, `${direction}-${index+1}.png`)).resize(previewWidth).png().toBuffer(), left: 16+index*(previewWidth+16), top: 72 });
  }
  const totalWidth = 3*previewWidth+64;
  const background = vector(`<rect width="100%" height="100%" fill="#e8e1d7"/>${text(titles[direction],16,44,24)}${text("DRAFT DIRECTION",totalWidth-215,44,15,palette.muted)}`, totalWidth, previewHeight+88);
  await sharp(background).composite(layers).removeAlpha().png().toFile(resolve(outputDirectory, `direction-${direction}.png`));
}
console.log("Rendered three unapproved visual directions, each showing the first three screenshots. Nothing uploaded.");
