import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../scripts/manifest.mjs";

const root = process.cwd();
const EXPECTED_PERMISSIONS = ["activeTab", "contextMenus", "scripting", "storage"];
const text = (path: string) => readFileSync(join(root, path), "utf8");
const major = (v: unknown) => Number.parseInt(String(v), 10);

describe.each(["chrome", "firefox"] as const)("%s manifest", (target) => {
  const load = () => buildManifest(target);

  it("is Manifest V3 and requests exactly the documented permissions", async () => {
    const m = await load();
    expect(m.manifest_version).toBe(3);
    expect([...(m.permissions as string[])].sort()).toEqual(EXPECTED_PERMISSIONS);
  });

  it("asks for no host access, no persistent scripts and no exposed resources", async () => {
    const m = await load();
    for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions", "content_scripts", "web_accessible_resources", "externally_connectable", "devtools_page", "chrome_url_overrides"]) {
      expect(key in m).toBe(false);
    }
    expect(JSON.stringify(m)).not.toContain("<all_urls>");
    expect(JSON.stringify(m)).not.toContain("*://");
  });

  it("does not loosen the content security policy", async () => {
    const csp = JSON.stringify((await load()).content_security_policy ?? "");
    expect(csp).toContain("wasm-unsafe-eval");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("http");
  });

  it("only binds the toolbar action shortcut", async () => {
    expect(Object.keys((await load()).commands as object)).toEqual(["_execute_action"]);
  });

  it("references files that exist", async () => {
    const m = (await load()) as { icons: Record<string, string>; action: { default_popup: string; default_icon: Record<string, string> }; options_ui: { page: string } };
    for (const path of [...Object.values(m.icons), ...Object.values(m.action.default_icon)]) {
      expect(existsSync(join(root, "src", path))).toBe(true);
    }
    expect(existsSync(join(root, "src/popup", m.action.default_popup))).toBe(true);
    expect(existsSync(join(root, "src/options", m.options_ui.page))).toBe(true);
  });

  it("matches the package version", async () => {
    expect((await load()).version).toBe(JSON.parse(text("package.json")).version);
  });
});

describe("browser-specific keys", () => {
  it("Chrome uses a service worker and a minimum version", async () => {
    const m = await buildManifest("chrome");
    expect(m.background).toEqual({ service_worker: "background.js" });
    expect("browser_specific_settings" in m).toBe(false);
    expect(major(m.minimum_chrome_version)).toBeGreaterThanOrEqual(114);
  });

  it("Firefox uses an event page, an id, and declares that no data is collected", async () => {
    const m = (await buildManifest("firefox")) as { background: unknown; browser_specific_settings: { gecko: Record<string, any>; gecko_android: Record<string, any> } };
    expect(m.background).toEqual({ scripts: ["background.js"] });
    const { gecko, gecko_android } = m.browser_specific_settings;
    expect(gecko.id).toContain("@");
    expect(gecko.data_collection_permissions).toEqual({ required: ["none"] });
    expect(major(gecko.strict_min_version)).toBeGreaterThanOrEqual(140);
    expect(major(gecko_android.strict_min_version)).toBeGreaterThanOrEqual(142);
  });

  it("the gecko id can be injected for release builds", async () => {
    const m = (await buildManifest("firefox", { geckoId: "contextlens@example.org" })) as any;
    expect(m.browser_specific_settings.gecko.id).toBe("contextlens@example.org");
  });
});

describe("permission documentation", () => {
  it("every requested permission is explained in docs/ARCHITECTURE.md", () => {
    const docs = text("docs/ARCHITECTURE.md");
    const section = docs.slice(docs.indexOf("## Permissions"));
    for (const permission of EXPECTED_PERMISSIONS) expect(section).toContain(`\`${permission}\``);
  });
});
