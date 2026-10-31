/** Renders header and search artwork using approved copy and captured native UI. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const rootDirectory = resolve(import.meta.dirname, "../..");
const sourceDirectory = resolve(rootDirectory, "apps/mobile/store/1.0.0/creative-v2");
const outputDirectory = resolve(process.argv[2] ?? resolve(rootDirectory, "apps/mobile/store/1.0.0/creative-v3/creative-assets"));
const palette = { cream: "#faf6ef", terra: "#b03a25", paper: "#fffdf9" };
const itemRegion = { left: 1056, top: 1000, width: 930, height: 720 };
const specifications = [
  { key: "header", width: 1920, height: 823, scale: 2 },
  { key: "search-results", width: 960, height: 640, scale: 4 },
];

/** Creates a text element from the approved wording. @param {string} value Copy. @param {number} left X. @param {number} baseline Y. @param {number} size Font size. @param {number} weight Font weight. @returns {string} SVG text. */
function text(value, left, baseline, size, weight = 700) {
  return `<text x="${left}" y="${baseline}" font-family="Helvetica Neue, Arial" font-size="${size}" font-weight="${weight}" letter-spacing="${size >= 60 ? -2 : 0}" fill="${palette.cream}">${value}</text>`;
}

/** Creates a full-resolution composition. @param {object} specification Canvas dimensions. @param {string} content SVG body. @returns {Buffer} SVG bytes. */
function vector(specification, content) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${specification.width * specification.scale}" height="${specification.height * specification.scale}" viewBox="0 0 ${specification.width} ${specification.height}">${content}</svg>`);
}

/** Sizes a captured native interface region without reconstructing UI. @param {number} width Output pixels. @returns {Promise<Buffer>} Rounded interface crop. */
async function interfaceCrop(width) {
  const pixels = await sharp(resolve(sourceDirectory, "native/ipad/itemized.png")).extract(itemRegion).resize(width).png().toBuffer();
  const dimensions = await sharp(pixels).metadata();
  const mask = Buffer.from(`<svg width="${dimensions.width}" height="${dimensions.height}"><rect width="100%" height="100%" rx="${width * 0.035}" fill="white"/></svg>`);
  return sharp(pixels).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

/** Renders one placement with its own proportions. @param {object} specification Placement dimensions. @returns {Promise<object>} Export information. */
async function render(specification) {
  const header = specification.key === "header";
  const scale = specification.scale;
  let background = `<rect width="100%" height="100%" fill="${palette.terra}"/>`;
  background += text("HaalKhata", header ? 244 : 64, header ? 260 : 66, header ? 34 : 26);
  background += text("Snap the bill.", header ? 240 : 61, header ? 380 : 150, header ? 94 : 68);
  background += text("Skip the typing.", header ? 240 : 61, header ? 490 : 226, header ? 94 : 68);
  background += text("AI reads the receipt. You choose the split.", header ? 246 : 65, header ? 575 : 275, header ? 28 : 22, 400);
  const receiptWidth = header ? 145 : 130;
  const receipt = await sharp(resolve(sourceDirectory, "california-receipt.png")).trim().resize(receiptWidth * scale).rotate(-6, { background: "#00000000" }).png().toBuffer();
  const native = await interfaceCrop((header ? 520 : 380) * scale);
  background += header
    ? `<path d="M1010 385 C1030 326 1088 327 1110 342 M1090 326 L1110 342 L1087 351" fill="none" stroke="${palette.cream}" stroke-width="4" stroke-linecap="round"/>`
    : `<path d="M320 463 C350 436 375 435 410 448 M393 430 L410 448 L388 456" fill="none" stroke="${palette.cream}" stroke-width="3" stroke-linecap="round"/>`;
  const filename = resolve(outputDirectory, `${specification.key}.png`);
  await sharp(vector(specification, background)).composite([
    { input: native, left: (header ? 1130 : 450) * scale, top: (header ? 225 : 310) * scale },
    { input: receipt, left: (header ? 990 : 130) * scale, top: (header ? 442 : 310) * scale },
  ]).flatten({ background: palette.terra }).removeAlpha().png().toFile(filename);
  const dimensions = await sharp(filename).metadata();
  if (dimensions.width !== specification.width * scale || dimensions.height !== specification.height * scale || dimensions.hasAlpha) throw new Error(`Invalid creative export: ${filename}`);
  await sharp(filename).resize(header ? 1440 : 1080).png().toFile(resolve(outputDirectory, `${specification.key}-preview.png`));
  return { placement: specification.key, filename: `${specification.key}.png`, width: dimensions.width, height: dimensions.height, hasAlpha: dimensions.hasAlpha };
}

await mkdir(outputDirectory, { recursive: true });
const exports = [];
for (const specification of specifications) exports.push(await render(specification));
await writeFile(resolve(outputDirectory, "manifest.json"), JSON.stringify({ status: "Rendered for Apple placement preview; not uploaded", source: "Approved Bold product story; actual iPad native itemized capture; fictional California receipt", exports }, null, 2) + "\n");
console.log(JSON.stringify(exports));
