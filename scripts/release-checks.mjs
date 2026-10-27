export const REQUIRED_FILES = [
  "background.js", "base.css", "content.js", "manifest.json", "options.css", "options.html", "options.js",
  "popup.css", "popup.html", "popup.js", "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
];
const PERMISSIONS = ["activeTab", "contextMenus", "scripting", "storage"];
const PLACEHOLDER = "REPLACE-BEFORE-RELEASE";

export function checkFileSet(files) {
  const problems = [];
  for (const file of REQUIRED_FILES) if (!files.includes(file)) problems.push(`missing file: ${file}`);
  for (const file of files) {
    if (!REQUIRED_FILES.includes(file)) problems.push(`unexpected file in package: ${file}`);
    if (file.endsWith(".map")) problems.push(`source map in package: ${file}`);
  }
  return problems;
}

export function checkManifest(manifest, { version, target }) {
  const problems = [];
  if (manifest.version !== version) problems.push(`manifest version ${manifest.version} does not match package version ${version}`);
  if (JSON.stringify([...(manifest.permissions ?? [])].sort()) !== JSON.stringify(PERMISSIONS)) problems.push("permissions differ from the documented set");
  if (manifest.host_permissions || manifest.content_scripts) problems.push("manifest requests host access or persistent content scripts");
  if (typeof manifest.description !== "string" || manifest.description.length > 132) problems.push("description is missing or longer than 132 characters (Chrome Web Store limit)");
  if (target === "firefox") {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!gecko?.id || gecko.id.includes(PLACEHOLDER)) problems.push("Firefox add-on id is still the placeholder; set GECKO_ID to the real id");
    if (JSON.stringify(gecko?.data_collection_permissions) !== JSON.stringify({ required: ["none"] })) problems.push("Firefox data_collection_permissions must declare none");
  }
  return problems;
}
