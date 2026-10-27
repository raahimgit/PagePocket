import { build, context } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildManifest } from "./manifest.mjs";

const target = process.argv[2];
const watch = process.argv.includes("--watch");

if (target !== "chrome" && target !== "firefox") {
  console.error("usage: build.mjs <chrome|firefox> [--watch]");
  process.exit(1);
}

const out = resolve("dist", target);

// Background and content scripts must be classic scripts (IIFE): Firefox loads
// MV3 background as `scripts`, and executeScript({files}) does not accept modules.
const entries = {
  background: "src/background/index.ts",
  content: "src/content/index.ts",
  popup: "src/popup/index.ts",
  options: "src/options/index.ts",
};

const options = {
  entryPoints: entries,
  outdir: out,
  bundle: true,
  format: "iife",
  target: target === "firefox" ? "firefox140" : "chrome114",
  sourcemap: false,
  logLevel: "info",
};

async function manifest() {
  await writeFile(resolve(out, "manifest.json"), JSON.stringify(await buildManifest(target), null, 2));
}

async function staticFiles() {
  await cp("src/popup/popup.html", resolve(out, "popup.html"));
  await cp("src/options/options.html", resolve(out, "options.html"));
  for (const file of ["base.css"]) await cp(`src/shared/${file}`, resolve(out, file));
  await cp("src/popup/popup.css", resolve(out, "popup.css"));
  await cp("src/options/options.css", resolve(out, "options.css"));
  await cp("src/icons", resolve(out, "icons"), { recursive: true });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  await staticFiles();
  await manifest();
  console.log(`watching -> ${out}`);
} else {
  await build(options);
  await staticFiles();
  await manifest();
}
