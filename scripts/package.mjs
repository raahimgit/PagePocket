import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { checkFileSet, checkManifest } from "./release-checks.mjs";
import { createZip } from "./zip.mjs";

const SOURCE_DIRS = ["src", "scripts", "assets", "docs", "tests", "e2e", ".github"];
const SOURCE_FILES = [
  "package.json", "tsconfig.json", "tsconfig.test.json", "vitest.config.ts", "README.md", "LICENSE", "CHANGELOG.md",
  "CONTRIBUTING.md", "PRIVACY.md", "SECURITY.md", ".gitignore", "PagePocket logo.png",
];

async function walk(dir, base = dir) {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) out.push(...(await walk(path, base)));
    else out.push(relative(base, path).split(sep).join("/"));
  }
  return out;
}

async function entriesFor(dir, names) {
  return Promise.all(names.map(async (name) => ({ name, data: await readFile(join(dir, name)) })));
}

function fail(messages) {
  for (const message of messages) console.error(`  - ${message}`);
  process.exit(1);
}

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const requested = process.argv.slice(2);
const targets = requested.length ? requested : ["chrome", "firefox", "source"];
const outDir = resolve("release");
await mkdir(outDir, { recursive: true });

async function write(name, entries) {
  const zip = createZip(entries);
  const path = join(outDir, name);
  await writeFile(path, zip);
  const hash = createHash("sha256").update(zip).digest("hex");
  console.log(`${name}  ${(zip.length / 1024).toFixed(1)} KiB  sha256 ${hash.slice(0, 16)}...`);
}

for (const target of targets) {
  if (target === "source") {
    const names = [];
    for (const dir of SOURCE_DIRS) {
      try { names.push(...(await walk(dir, ".")).map((f) => f)); } catch { /* directory is optional */ }
    }
    for (const file of SOURCE_FILES) {
      try { await stat(file); names.push(file); } catch { /* file is optional */ }
    }
    await write(`pagepocket-source-${pkg.version}.zip`, await entriesFor(".", [...new Set(names)]));
    continue;
  }

  if (target !== "chrome" && target !== "firefox") fail([`unknown target "${target}" (use chrome, firefox or source)`]);

  const build = spawnSync(process.execPath, ["scripts/build.mjs", target], { stdio: "inherit", env: process.env });
  if (build.status !== 0) fail([`build failed for ${target}`]);

  const dir = resolve("dist", target);
  const files = await walk(dir);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const problems = [...checkFileSet(files), ...checkManifest(manifest, { version: pkg.version, target })];
  if (problems.length) {
    console.error(`Refusing to package ${target}:`);
    fail(problems);
  }
  await write(`pagepocket-${target}-${pkg.version}.zip`, await entriesFor(dir, files));
}
