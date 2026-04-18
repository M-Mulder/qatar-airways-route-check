/**
 * Builds header + favicon assets from `public/qatared-logo-source.png`:
 * - Trims outer dark border, upscales for sharpness, zooms center so the oryx fills the maroon disc.
 * - Makes near-black pixels transparent (no black box on favicon / header).
 * - Writes high-res `public/qatared-logo.png` and app icons.
 *
 * Run: npm run build:logo
 */
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const INPUT = join(root, "public", "qatared-logo-source.png");

/** Center crop zoom: higher = tighter crop = oryx + maroon fill the frame more. */
const ZOOM = 1.42;

/** Minimum long edge before zoom (upscale blurry small sources). */
const UPSCALE_MIN = 900;

/** Header / retina asset size (square). */
const HEADER_PX = 512;

/**
 * Remove matte black / neutral grey UI background only — keeps saturated dark browns
 * (e.g. mustache ink) which would be removed by naive R,G,B < threshold.
 */
async function knockOutNeutralDarkPng(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const avg = (r + g + b) / 3;
    const spread = max - min;
    // Near-black or neutral grey (flat RGB) → transparent. Coloured dark pixels (mustache ink) stay.
    if (avg < 48 && spread < 14) {
      out[i + 3] = 0;
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function main() {
  let buf = await readFile(INPUT);
  let meta = await sharp(buf).metadata();
  const w0 = meta.width;
  const h0 = meta.height;
  if (!w0 || !h0) throw new Error("Could not read logo dimensions");

  // Trim dark / uniform outer padding (helps remove black bars before zoom).
  buf = await sharp(buf).ensureAlpha().trim({ threshold: 18 }).png().toBuffer();
  meta = await sharp(buf).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error("Trim failed");

  // Upscale small sources so later downscales to favicon stay crisp.
  const longEdge = Math.max(w, h);
  if (longEdge < UPSCALE_MIN) {
    const scale = UPSCALE_MIN / longEdge;
    buf = await sharp(buf)
      .resize(Math.round(w * scale), Math.round(h * scale), {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
      })
      .png()
      .toBuffer();
  }

  meta = await sharp(buf).metadata();
  const ww = meta.width;
  const hh = meta.height;
  if (!ww || !hh) throw new Error("Upscale failed");

  const nw = Math.round(ww * ZOOM);
  const nh = Math.round(hh * ZOOM);
  const left = Math.max(0, Math.floor((nw - ww) / 2));
  const top = Math.max(0, Math.floor((nh - hh) / 2));

  let zoomed = await sharp(buf)
    .resize(nw, nh)
    .extract({ left, top, width: ww, height: hh })
    .png()
    .toBuffer();

  zoomed = await knockOutNeutralDarkPng(zoomed);

  // Square, high-res header asset (transparent outside the disc).
  const headerPng = await sharp(zoomed)
    .resize(HEADER_PX, HEADER_PX, {
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  await writeFile(join(root, "public", "qatared-logo.png"), headerPng);

  // Favicons: generate from high-res master so 32px stays sharp; transparent.
  const fav32 = await sharp(headerPng)
    .resize(32, 32, { kernel: sharp.kernel.lanczos3, fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  await writeFile(join(root, "src", "app", "icon.png"), fav32);

  const fav48 = await sharp(headerPng)
    .resize(48, 48, { kernel: sharp.kernel.lanczos3, fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  await writeFile(join(root, "public", "icon-48.png"), fav48);

  await sharp(headerPng)
    .resize(180, 180, { kernel: sharp.kernel.lanczos3, fit: "cover", position: "centre" })
    .png()
    .toFile(join(root, "src", "app", "apple-icon.png"));

  console.info(
    `Logo assets built (zoom=${ZOOM}, header=${HEADER_PX}px, neutral-dark knockout): public/qatared-logo.png, public/icon-48.png, src/app/icon.png, apple-icon.png`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
