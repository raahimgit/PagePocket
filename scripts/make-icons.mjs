import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile("assets/icon.svg");
for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`src/icons/icon-${size}.png`);
}
