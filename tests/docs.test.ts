import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../scripts/manifest.mjs";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const pkg = JSON.parse(read("package.json")) as { version: string; scripts: Record<string, string> };
const docFiles = ["README.md", "PRIVACY.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];
const PERMISSIONS = ["activeTab", "scripting", "storage", "contextMenus"];

describe("documentation", () => {
  it("has every required file", () => {
    for (const file of ["README.md", "LICENSE", "PRIVACY.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", "docs/ARCHITECTURE.md", "docs/DATA_FORMAT.md", "docs/BROWSER_SUPPORT.md", "docs/STORE_LISTING.md"]) {
      expect(existsSync(join(root, file))).toBe(true);
    }
  });

  it("README covers the required sections", () => {
    const readme = read("README.md");
    for (const heading of ["The problem", "What it does", "Install from source", "Privacy", "Permissions", "Architecture", "Browser support", "Development", "Testing", "Contributing", "Roadmap", "License"]) {
      expect(new RegExp(`^## ${heading}`, "m").test(readme)).toBe(true);
    }
  });

  it("every relative link and image resolves to a file", () => {
    const broken: string[] = [];
    for (const file of docFiles) {
      for (const match of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1]!.split("#")[0]!;
        if (!target || /^[a-z]+:/i.test(target)) continue;
        if (!existsSync(resolve(root, dirname(file), target))) broken.push(`${file} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("every `npm run` command mentioned exists in package.json", () => {
    const missing: string[] = [];
    for (const file of docFiles) {
      for (const match of read(file).matchAll(/npm run ([\w:-]+)/g)) {
        if (!(match[1]! in pkg.scripts)) missing.push(`${file}: npm run ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("README, PRIVACY and the store drafts name every permission", () => {
    for (const file of ["README.md", "PRIVACY.md", "docs/STORE_LISTING.md", "docs/ARCHITECTURE.md"]) {
      const text = read(file);
      for (const permission of PERMISSIONS) expect(text).toContain(`\`${permission}\``);
    }
  });

  it("does not claim publication anywhere", () => {
    for (const file of docFiles) {
      expect(/(is|are|now|already)\s+(available|published|live)\s+(on|in)\s+the\s+(chrome web store|firefox)/i.test(read(file))).toBe(false);
    }
    expect(read("docs/STORE_LISTING.md")).toContain("has not been submitted");
    expect(read("README.md")).toContain("has not been submitted to or published on");
  });

  it("versions agree across package, changelog and privacy statement", () => {
    expect(read("CHANGELOG.md")).toContain(`## ${pkg.version}`);
    expect(/PagePocket (\d+\.\d+\.\d+)/.exec(read("PRIVACY.md"))?.[1]).toBe(pkg.version);
  });

  it("store copy matches the manifest and its limits", async () => {
    const manifest = (await buildManifest("chrome")) as { name: string; description: string };
    expect(manifest.description.length <= 132).toBe(true);
    expect(manifest.name.length <= 45).toBe(true);
    expect(read("docs/STORE_LISTING.md")).toContain(manifest.description);
  });

  it("screenshots are real PNGs at store size", () => {
    for (const name of ["library", "search", "library-dark"]) {
      const png = readFileSync(join(root, `docs/screenshots/${name}.png`));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1280, 800]);
    }
  });

  it("the license is MIT", () => {
    expect(read("LICENSE")).toContain("MIT License");
  });
});
