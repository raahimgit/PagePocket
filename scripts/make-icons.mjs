import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const { data: source, info } = await sharp("PagePocket logo.png").removeAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < source.length; i += info.channels, j += 4) {
  const r = source[i], g = source[i + 1], b = source[i + 2];
  // The supplied artwork uses a grayscale checkerboard to preview transparency.
  // Its violet mark has a strong red/green separation, unlike the background and cutout.
  const alpha = Math.max(0, Math.min(1, (r - g - 5) / 38));
  const y = Math.floor(j / 4 / info.width) / info.height;
  rgba[j] = Math.round(136 - 30 * y);
  rgba[j + 1] = Math.round(50 + 6 * y);
  rgba[j + 2] = Math.round(255 - 15 * y);
  rgba[j + 3] = Math.round(alpha * 255);
}

const mark = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .extract({ left: 185, top: 145, width: 335, height: 375 })
  .resize({ width: 400, height: 448, fit: "contain" })
  .png()
  .toBuffer();
const canvas = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: mark, gravity: "centre" }])
  .png()
  .toBuffer();

await mkdir("src/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(canvas).resize(size, size).png({ compressionLevel: 9 }).toFile(`src/icons/icon-${size}.png`);
}
