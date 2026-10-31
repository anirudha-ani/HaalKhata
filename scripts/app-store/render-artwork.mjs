/** Renders review-only App Store artwork options from the existing icon and approved brand copy. */

import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const rootDirectory = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(process.argv[2] ?? resolve(rootDirectory, "apps/mobile/store/1.0.0/artwork-options"));
const dimensions = { width: 5244, height: 2950 };
const palette = { paper: "#faf6ef", ink: "#292217", brand: "#b03a25", line: "#eae1d1" };
const approvedSubtitle = "Shared expenses, made simple";

/**
 * Produces one draft composition using the unchanged application icon.
 * @param {"a" | "b"} variant Composition to render for user review.
 * @returns {Promise<string>} Absolute PNG path.
 */
async function renderOption(variant) {
  const centered = variant === "a";
  const iconSize = centered ? 490 : 620;
  const iconLeft = centered ? Math.round((dimensions.width - iconSize) / 2) : 600;
  const iconTop = centered ? 570 : 1135;
  const textLeft = centered ? dimensions.width / 2 : 1510;
  const anchor = centered ? "middle" : "start";
  const wordTop = centered ? 1535 : 1365;
  const subtitleTop = centered ? 1775 : 1600;
  const background = centered ? palette.paper : palette.brand;
  const foreground = centered ? palette.ink : palette.paper;
  const rules = centered
    ? `<path d="M420 410H4824M420 2540H4824" stroke="${palette.line}" stroke-width="4"/>`
    : `<path d="M430 430V2520M4814 430V2520" stroke="${palette.paper}" stroke-opacity=".22" stroke-width="4"/>`;
  const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}">
    <rect width="100%" height="100%" fill="${background}"/>
    ${rules}
    <text x="${textLeft}" y="${wordTop}" text-anchor="${anchor}" fill="${foreground}" font-family="Georgia" font-size="300" font-weight="700">HaalKhata</text>
    <text x="${textLeft}" y="${subtitleTop}" text-anchor="${anchor}" fill="${foreground}" font-family="Helvetica Neue, Helvetica, Arial" font-size="105">${approvedSubtitle}</text>
  </svg>`;
  const icon = await sharp(await readFile(resolve(rootDirectory, "apps/mobile/assets/icon.png")))
    .resize(iconSize, iconSize)
    .png()
    .toBuffer();
  const filename = resolve(outputDirectory, `header-option-${variant}.png`);
  await sharp(Buffer.from(artwork))
    .composite([{ input: icon, left: iconLeft, top: iconTop }])
    .flatten({ background })
    .removeAlpha()
    .png()
    .toFile(filename);
  return filename;
}

await mkdir(outputDirectory, { recursive: true });
const options = await Promise.all([renderOption("a"), renderOption("b")]);
const thumbnails = await Promise.all(options.map(filename => sharp(filename).resize(1200).png().toBuffer()));
await sharp({ create: { width: 1200, height: 1420, channels: 3, background: "#ffffff" } })
  .composite(thumbnails.map((input, index) => ({ input, left: 0, top: index * 735 })))
  .png()
  .toFile(resolve(outputDirectory, "artwork-options-preview.png"));
for (const filename of options) {
  const metadata = await sharp(filename).metadata();
  if (metadata.width !== dimensions.width || metadata.height !== dimensions.height || metadata.hasAlpha) {
    throw new Error(`Invalid artwork output: ${filename}`);
  }
  console.log(filename);
}
