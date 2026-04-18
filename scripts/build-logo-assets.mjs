/**
 * Zooms the center of the logo so the oryx fills the maroon disc more, then writes:
 * - public/qatared-logo.png (header / general)
 * - src/app/icon.png (32×32 favicon)
 * - src/app/apple-icon.png (180×180 touch icon)
 *
 * Run: node scripts/build-logo-assets.mjs
 */
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
/** Immutable source; script writes zoomed `qatared-logo.png` + app icons. */
const INPUT = join(root, "public", "qatared-logo-source.png");

/** Scale factor: >1 zooms in (fills circle). Tune if needed. */
const ZOOM = 1.24;

async function main() {
  const buf = await readFile(INPUT);
  const meta = await sharp(buf).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error("Could not read logo dimensions");

  const nw = Math.round(w * ZOOM);
  const nh = Math.round(h * ZOOM);
  const left = Math.max(0, Math.floor((nw - w) / 2));
  const top = Math.max(0, Math.floor((nh - h) / 2));

  const zoomed = await sharp(buf)
    .resize(nw, nh)
    .extract({ left, top, width: w, height: h })
    .png()
    .toBuffer();

  await writeFile(join(root, "public", "qatared-logo.png"), zoomed);

  await sharp(zoomed).resize(32, 32, { fit: "cover", position: "centre" }).png().toFile(join(root, "src", "app", "icon.png"));

  await sharp(zoomed)
    .resize(180, 180, { fit: "cover", position: "centre" })
    .png()
    .toFile(join(root, "src", "app", "apple-icon.png"));

  console.info(`Logo assets built (zoom=${ZOOM}): public/qatared-logo.png, src/app/icon.png, src/app/apple-icon.png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
