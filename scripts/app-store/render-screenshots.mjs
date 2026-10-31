/** Composes store screenshots from full-resolution native captures and the selected brand copy. */

import { createRequire } from "node:module";
import { mkdir, readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const rootDirectory = resolve(import.meta.dirname, "../..");
const storeDirectory = resolve(rootDirectory, "apps/mobile/store/1.0.0");
const metadata = JSON.parse(await readFile(resolve(storeDirectory, "metadata.json"), "utf8"));
const palette = { paper: "#faf6ef", ink: "#292217", brand: "#b03a25", line: "#eae1d1" };
const devices = {
  iphone: { width: 1320, height: 2868, screenWidth: 960, screenTop: 680, titleSize: 112, detailSize: 42, corner: 100 },
  ipad: { width: 2064, height: 2752, screenWidth: 1530, screenTop: 650, titleSize: 130, detailSize: 50, corner: 58 },
};
const requestedFamilies = process.argv.slice(2);
const families = requestedFamilies.length ? requestedFamilies : Object.keys(devices);
if (families.some(family => !Object.hasOwn(devices, family))) {
  throw new Error("Choose iphone, ipad, or omit arguments to render both families.");
}

/**
 * Escapes text for an SVG text node.
 * @param {string} value Plain caption.
 * @returns {string} XML-safe caption.
 */
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Frames one untouched native screen under its selected marketing caption.
 * @param {string} family Device family to render.
 * @param {{key: string, title: string[], detail: string}} caption Selected caption.
 * @param {number} position Display order, starting at one.
 * @returns {Promise<string>} Absolute output path.
 */
async function renderScreen(family, caption, position) {
  const layout = devices[family];
  const sourcePath = resolve(storeDirectory, "screenshots/raw", family, `${caption.key}.png`);
  const source = await sharp(sourcePath).metadata();
  if (source.width < layout.width || source.height < layout.height || source.width >= source.height) {
    throw new Error(`Use a full-resolution portrait native capture for ${sourcePath}`);
  }
  const screenHeight = Math.round(layout.screenWidth * source.height / source.width);
  if (layout.screenTop + screenHeight + 36 > layout.height) {
    throw new Error(`Native screen does not fit the ${family} composition`);
  }
  const screenLeft = Math.round((layout.width - layout.screenWidth) / 2);
  const firstBaseline = family === "iphone" ? 300 : 265;
  const titleLeading = Math.round(layout.titleSize * 1.15);
  const detailBaseline = firstBaseline + titleLeading * caption.title.length + 12;
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">
    <rect width="100%" height="100%" fill="${palette.paper}"/>
    <text x="${layout.width / 2}" y="115" text-anchor="middle" fill="${palette.brand}" font-family="Georgia" font-size="42" font-weight="700">HaalKhata</text>
    ${caption.title.map((line, index) => `<text x="${layout.width / 2}" y="${firstBaseline + index * titleLeading}" text-anchor="middle" fill="${palette.ink}" font-family="Georgia" font-size="${layout.titleSize}" font-weight="700">${escapeXml(line)}</text>`).join("")}
    <text x="${layout.width / 2}" y="${detailBaseline}" text-anchor="middle" fill="${palette.ink}" font-family="Helvetica Neue, Helvetica, Arial" font-size="${layout.detailSize}">${escapeXml(caption.detail)}</text>
    <rect x="${screenLeft - 18}" y="${layout.screenTop - 18}" width="${layout.screenWidth + 36}" height="${screenHeight + 36}" rx="${layout.corner + 18}" fill="${palette.ink}"/>
  </svg>`;
  const mask = Buffer.from(`<svg width="${layout.screenWidth}" height="${screenHeight}"><rect width="100%" height="100%" rx="${layout.corner}" fill="white"/></svg>`);
  const screen = await sharp(sourcePath)
    .resize(layout.screenWidth, screenHeight)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const outputDirectory = resolve(storeDirectory, "screenshots", family);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, `${String(position).padStart(2, "0")}-${caption.key}.png`);
  await sharp(Buffer.from(background))
    .composite([{ input: screen, left: screenLeft, top: layout.screenTop }])
    .flatten({ background: palette.paper })
    .removeAlpha()
    .png()
    .toFile(outputPath);
  const rendered = await sharp(outputPath).metadata();
  if (rendered.width !== layout.width || rendered.height !== layout.height || rendered.hasAlpha) {
    throw new Error(`Invalid store screenshot: ${outputPath}`);
  }
  return outputPath;
}

// Validate the entire requested input set before writing any deliverable.
for (const family of families) {
  for (const caption of metadata.screenshots) {
    const sourcePath = resolve(storeDirectory, "screenshots/raw", family, `${caption.key}.png`);
    await access(sourcePath).catch(() => { throw new Error(`Missing native capture: ${sourcePath}`); });
  }
}

for (const family of families) {
  const outputs = [];
  for (const [index, caption] of metadata.screenshots.entries()) {
    outputs.push(await renderScreen(family, caption, index + 1));
  }
  const thumbnailWidth = family === "iphone" ? 264 : 330;
  const thumbnailHeight = Math.round(thumbnailWidth * devices[family].height / devices[family].width);
  const thumbnails = await Promise.all(outputs.map(filename => sharp(filename).resize(thumbnailWidth).png().toBuffer()));
  await sharp({ create: { width: thumbnailWidth * outputs.length, height: thumbnailHeight, channels: 3, background: palette.paper } })
    .composite(thumbnails.map((input, index) => ({ input, left: index * thumbnailWidth, top: 0 })))
    .png()
    .toFile(resolve(storeDirectory, "screenshots", `${family}-preview.png`));
  console.log(`${family}: ${outputs.length} screenshots rendered; visually inspect every output before uploading.`);
}
