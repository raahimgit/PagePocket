import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Firefox requires a data-collection declaration for new add-ons (AMO, since
// 3 Nov 2025). The key is understood from Firefox 140 (desktop) and 142
// (Android), so those become the minimum versions.
// Run from the repository root.
export async function buildManifest(target, { geckoId = process.env.GECKO_ID ?? "pagepocket@REPLACE-BEFORE-RELEASE" } = {}) {
  const manifest = JSON.parse(await readFile(resolve("src/manifest.base.json"), "utf8"));
  if (target === "chrome") {
    manifest.background = { service_worker: "background.js" };
    manifest.minimum_chrome_version = "114";
  } else if (target === "firefox") {
    manifest.background = { scripts: ["background.js"] };
    manifest.browser_specific_settings = {
      gecko: {
        id: geckoId,
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
      gecko_android: { strict_min_version: "142.0" },
    };
  } else {
    throw new Error(`Unknown target: ${target}`);
  }
  return manifest;
}
