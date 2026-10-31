/** Renders the approved store screenshots; an optional output directory keeps submitted exports intact. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const rootDirectory = resolve(import.meta.dirname, "../..");
const sourceDirectory = resolve(rootDirectory, "apps/mobile/store/1.0.0/creative-v2");
const outputDirectory = resolve(process.argv[2] ?? resolve(rootDirectory, "apps/mobile/store/1.0.0/creative-v3"));
const palette = { cream: "#faf6ef", paper: "#fffdf9", ink: "#292217", terra: "#b03a25", pink: "#f0ded1", muted: "#746957" };
const families = [{ key: "iphone", width: 660, height: 1434 }, { key: "ipad", width: 1032, height: 1376 }];
const slides = [
  { key: "ai", label: "AI RECEIPT SCANNING", title: ["Snap the bill.", "Skip the typing."], detail: "AI reads the receipt. You choose the split." },
  { key: "itemized", label: "PICK YOUR ITEMS", title: ["Your meal.", "Your share."], detail: "Pick your items. Share the dessert." },
  { key: "live", label: "SPLIT LIVE", title: ["One bill.", "Everyone joins in."], detail: "Friends open the link and pick their items." },
  { key: "settle", label: "SETTLE UP", title: ["Settle up.", "Your way."], detail: "Open Venmo or copy Zelle details.", secondDetail: "Pay there, then record it here." },
  { key: "groups", label: "YOUR PEOPLE. YOUR PLANS.", title: ["Dinner. Rent.", "Tahoe weekend."], detail: "Keep shared expenses together." },
  { key: "balances", label: "CLEAR BALANCES", title: ["Who owes what.", "Clear at a glance."], detail: "See each person’s balance in one place." },
];
const regions = {
  iphone: {
    itemPair: { left: 46, top: 546, width: 1228, height: 1076 },
    dessertPair: { left: 46, top: 1660, width: 1228, height: 1077 },
    live: { left: 46, top: 606, width: 1228, height: 444 },
    shares: { left: 46, top: 1650, width: 1228, height: 467 },
    settle: { left: 0, top: 375, width: 1320, height: 2493 },
    groups: { left: 0, top: 188, width: 1320, height: 2350 },
    balances: { left: 0, top: 188, width: 1320, height: 2520 },
  },
  ipad: {
    itemPair: { left: 1056, top: 1000, width: 930, height: 720 },
    dessertPair: { left: 1056, top: 1762, width: 930, height: 700 },
    live: { left: 64, top: 232, width: 930, height: 294 },
    shares: { left: 64, top: 957, width: 930, height: 700 },
    settle: { left: 384, top: 568, width: 1280, height: 1668 },
    groups: { left: 0, top: 60, width: 2048, height: 1500 },
    balances: { left: 0, top: 60, width: 2048, height: 1800 },
  },
};

/** Escapes literal SVG text. @param {string} value Text. @returns {string} Escaped text. */
function escape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;"); }
/** Formats a line. @param {string} value Text. @param {number} left X. @param {number} baseline Y. @param {number} size Size. @param {string} color Color. @param {number} weight Weight. @returns {string} SVG. */
function text(value, left, baseline, size, color = palette.ink, weight = 700) { return `<text x="${left}" y="${baseline}" font-family="Helvetica Neue, Arial" font-size="${size}" font-weight="${weight}" letter-spacing="${size >= 55 ? -2 : 0}" fill="${color}">${escape(value)}</text>`; }
/** Rasterizes text at full export resolution. @param {object} family Canvas. @param {string} content SVG. @returns {Buffer} Full-size SVG. */
function vector(family, content) { return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${family.width*2}" height="${family.height*2}" viewBox="0 0 ${family.width} ${family.height}">${content}</svg>`); }
/** Places a layer in full-resolution coordinates. @param {Buffer} input Raster. @param {number} left X. @param {number} upper Y. @returns {object} Composite layer. */
function layer(input, left, upper) { return { input, left: Math.round(left*2), top: Math.round(upper*2) }; }
/** Crops real native UI without rebuilding its content. @param {object} family Device. @param {string} filename Capture. @param {object} region Crop. @param {number} width Logical width. @param {number} radius Logical corner radius. @returns {Promise<Buffer>} Native crop. */
async function capture(family, filename, region, width, radius = 20) {
  const pixels = await sharp(resolve(sourceDirectory, "native", family.key, `${filename}.png`)).extract(region).resize(Math.round(width*2)).png().toBuffer();
  const information = await sharp(pixels).metadata();
  const mask = Buffer.from(`<svg width="${information.width}" height="${information.height}"><rect width="100%" height="100%" rx="${radius*2}" fill="white"/></svg>`);
  return sharp(pixels).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}
/** Prepares the existing fictional receipt at export resolution. @param {number} width Logical width. @returns {Promise<Buffer>} Receipt illustration. */
async function receipt(width) { return sharp(resolve(sourceDirectory, "california-receipt.png")).trim().resize(Math.round(width*2)).rotate(-6, { background: "#00000000" }).png().toBuffer(); }

/** Renders one device-specific feature. @param {object} family Device. @param {number} index Slide index. @param {boolean} alternate Whether to show the alternate settlement headline. @returns {Promise<void>} Saved PNG. */
async function render(family, index, alternate = false) {
  const slide = slides[index];
  const tablet = family.key === "ipad";
  const dark = index === 0 || index === 2 || index === 4;
  const foreground = dark ? palette.cream : palette.ink;
  const secondary = dark ? palette.cream : palette.muted;
  const left = tablet ? 62 : 42;
  const title = alternate ? ["From split", "to settled."] : slide.title;
  const titleSize = tablet ? 82 : title[1].length > 16 ? 59 : 66;
  let background = `<rect width="100%" height="100%" fill="${dark ? palette.terra : palette.cream}"/>`;
  background += text(index === 0 ? "HaalKhata" : slide.label, left, 64, tablet ? 23 : 20, foreground);
  background += text(title[0], left-2, tablet ? 179 : 177, titleSize, foreground);
  background += text(title[1], left-2, tablet ? 273 : 254, titleSize, foreground);
  background += text(slide.detail, left+1, tablet ? 336 : 312, tablet ? 29 : 23, secondary, 400);
  if (slide.secondDetail) background += text(slide.secondDetail, left+1, tablet ? 379 : 348, tablet ? 29 : 23, secondary, 400);
  const layers = [];
  const crop = regions[family.key];
  if (index === 0) {
    background += text("AI RECEIPT SCANNING", left, tablet ? 420 : 376, tablet ? 23 : 18, foreground);
    if (tablet) {
      layers.push(layer(await receipt(208), 72, 570));
      layers.push(layer(await capture(family,"itemized",crop.itemPair,606), 364, 530));
      background += `<path d="M180 1070 C180 1140 315 1160 397 1070 M376 1075 L397 1070 L393 1092" fill="none" stroke="${foreground}" stroke-width="4" stroke-linecap="round"/>`;
      background += text("From receipt to everyone’s share.", 365, 1156, 29, foreground);
    } else {
      layers.push(layer(await receipt(174),234,410));
      background += `<path d="M330 784 V824 M316 810 L330 824 L344 810" fill="none" stroke="${foreground}" stroke-width="4" stroke-linecap="round"/>`;
      background += `<rect x="34" y="855" width="592" height="534" rx="28" fill="${palette.paper}"/>`;
      layers.push(layer(await capture(family,"itemized",crop.itemPair,568),46,870));
    }
  } else if (index === 1) {
    background += `<circle cx="${family.width-50}" cy="1040" r="450" fill="${palette.pink}"/>`;
    background += text("Pasta for Pezanne.",left+1,447,tablet ? 34 : 29);
    background += text("Dessert for everyone.",left+1,489,tablet ? 34 : 29,palette.terra);
    const width = tablet ? 740 : 580;
    layers.push(layer(await capture(family,"itemized",crop.dessertPair,width),tablet ? 146 : 40,548));
    background += text("Tap a name. Make it theirs.",left+1,tablet ? 1194 : 1172,tablet ? 34 : 29,palette.terra);
    background += text("Tax and tip follow each person’s items.",left+1,tablet ? 1240 : 1217,tablet ? 28 : 23,palette.muted,400);
  } else if (index === 2) {
    const width = tablet ? 610 : 580;
    const imageLeft = tablet ? 211 : 40;
    background += text("A shared bill, on everyone’s phone.",left+1,tablet ? 447 : 469,tablet ? 33 : 27,foreground);
    layers.push(layer(await capture(family,"live",crop.live,width),imageLeft,tablet ? 496 : 524));
    background += text("Everyone can see their share.",left+1,tablet ? 762 : 874,tablet ? 33 : 28,foreground);
    layers.push(layer(await capture(family,"live",crop.shares,width),imageLeft,tablet ? 810 : 927));
    if (!tablet) background += text("Dinner in San Francisco · $108.15",43,1306,23,foreground,400);
  } else if (index === 3) {
    const width = tablet ? 680 : 520;
    layers.push(layer(await capture(family,"settle-venmo",crop.settle,width),tablet ? 176 : 70,tablet ? 441 : 420));
  } else {
    const width = tablet ? 908 : index === 5 ? 510 : 540;
    layers.push(layer(await capture(family,slide.key,crop[slide.key],width),tablet ? 62 : (family.width-width)/2,tablet ? 456 : 440));
  }
  const filename = alternate ? "04-settle-alternative.png" : `${String(index+1).padStart(2,"0")}-${slide.key}.png`;
  await sharp(vector(family,background)).composite(layers).flatten({background:palette.cream}).removeAlpha().png().toFile(resolve(outputDirectory,alternate ? "options" : "",family.key,filename));
}

await mkdir(outputDirectory,{recursive:true});
for (const family of families) {
  await mkdir(resolve(outputDirectory,family.key),{recursive:true});
  await mkdir(resolve(outputDirectory,"options",family.key),{recursive:true});
  for (let index=0; index<slides.length; index+=1) await render(family,index);
  await render(family,3,true);
  const thumbWidth=family.key === "iphone" ? 330 : 420;
  const thumbHeight=Math.round(family.height/family.width*thumbWidth);
  const layers=[];
  for (const [index,slide] of slides.entries()) layers.push({input:await sharp(resolve(outputDirectory,family.key,`${String(index+1).padStart(2,"0")}-${slide.key}.png`)).resize(thumbWidth).png().toBuffer(),left:(index%3)*(thumbWidth+16),top:Math.floor(index/3)*(thumbHeight+16)});
  await sharp({create:{width:thumbWidth*3+32,height:thumbHeight*2+16,channels:3,background:palette.pink}}).composite(layers).png().toFile(resolve(outputDirectory,`${family.key}-preview.png`));
  console.log(`Rendered six ${family.key} slides and one settlement-copy alternative.`);
}
await mkdir(resolve(outputDirectory,"iphone-medium"),{recursive:true});
for (const [index,slide] of slides.entries()) {
  const filename=`${String(index+1).padStart(2,"0")}-${slide.key}.png`;
  await sharp(resolve(outputDirectory,"iphone",filename)).resize(1206,2622,{fit:"contain",background:palette.cream}).removeAlpha().png().toFile(resolve(outputDirectory,"iphone-medium",filename));
}
const choiceWidth=396;
const choiceHeight=Math.round(2868/1320*choiceWidth);
const choiceCanvas={width:choiceWidth+20,height:(choiceHeight+70)/2};
await sharp(vector(choiceCanvas,`<rect width="100%" height="100%" fill="${palette.pink}"/>${text("A · SETTLE UP. YOUR WAY.",10,25,12)}${text("B · FROM SPLIT TO SETTLED.",218,25,12)}`)).composite([
  {input:await sharp(resolve(outputDirectory,"iphone/04-settle.png")).resize(choiceWidth).png().toBuffer(),left:10,top:58},
  {input:await sharp(resolve(outputDirectory,"options/iphone/04-settle-alternative.png")).resize(choiceWidth).png().toBuffer(),left:choiceWidth+26,top:58},
]).removeAlpha().png().toFile(resolve(outputDirectory,"settlement-options.png"));
await writeFile(resolve(outputDirectory,"copy.json"),JSON.stringify({status:"Regenerated approved artwork. Inspect these exports before any new upload; submission.json records the original submission.",screenshots:slides},null,2)+"\n");
