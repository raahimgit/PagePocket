const { chromium } = require("playwright");
const { buildSync } = require("esbuild");
const { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const DIST = resolve("dist/chrome");

async function launch(extensionDir = DIST) {
  const profile = mkdtempSync(join(tmpdir(), "contextlens-e2e-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || undefined,
    headless: false,
    acceptDownloads: true,
    args: ["--headless=new", `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, "--no-sandbox"],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, extensionId: worker.url().split("/")[2], close: async () => { await context.close(); rmSync(profile, { recursive: true, force: true }); } };
}

// The shipped build has no host permissions, and activeTab cannot be granted
// from automation. This copy adds host access so the real injection and
// extraction chain can be exercised. It is never packaged.
function hostPermissionBuild() {
  const dir = mkdtempSync(join(tmpdir(), "contextlens-hostbuild-"));
  cpSync(DIST, dir, { recursive: true });
  const manifestPath = join(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = ["https://*/*"];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

function loadFixtures() {
  const { outputFiles } = buildSync({ entryPoints: ["tests/fixtures/pages.ts"], bundle: true, platform: "node", format: "cjs", write: false });
  const module = { exports: {} };
  new Function("module", "exports", "require", outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}

function reporter() {
  let failures = 0;
  return {
    check(label, ok, extra = "") { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  -> " + extra : ""}`); },
    finish() { console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED"); process.exit(failures ? 1 : 0); },
  };
}

module.exports = { launch, hostPermissionBuild, loadFixtures, reporter, DIST };
