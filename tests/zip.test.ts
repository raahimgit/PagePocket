import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkFileSet, checkManifest, REQUIRED_FILES } from "../scripts/release-checks.mjs";
import { createZip, crc32 } from "../scripts/zip.mjs";

interface Entry { name: string; text: string; crcOk: boolean }

// Independent reader: walks the central directory the way unzip does.
function readZip(zip: Buffer): Entry[] {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(cursor + 16);
    const packedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const data = inflateRawSync(zip.subarray(dataStart, dataStart + packedSize));
    entries.push({ name, text: data.toString("utf8"), crcOk: crc32(data) === crc });
    cursor += 46 + nameLength;
  }
  return entries;
}

describe("zip writer", () => {
  it("matches the standard CRC-32 check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips names and contents, including non-ASCII and empty files", () => {
    const zip = createZip([{ name: "b/é.txt", data: "héllo" }, { name: "a.txt", data: "x".repeat(5000) }, { name: "empty.txt", data: "" }]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["a.txt", "b/é.txt", "empty.txt"]);
    expect(entries.map((e) => e.text.length)).toEqual([5000, 5, 0]);
    expect(entries[1]!.text).toBe("héllo");
    expect(entries.every((e) => e.crcOk)).toBe(true);
  });

  it("is deterministic regardless of input order", () => {
    const a = createZip([{ name: "x", data: "1" }, { name: "y", data: "2" }]);
    const b = createZip([{ name: "y", data: "2" }, { name: "x", data: "1" }]);
    expect(a.equals(b)).toBe(true);
  });

  it.each(["/abs", "../up", "a/../b", "a\\b", "", "a//b"])("rejects unsafe name %s", (name) => {
    expect(() => createZip([{ name, data: "x" }])).toThrow();
  });
});

describe("release checks", () => {
  const manifest = {
    version: "1.2.3", permissions: ["activeTab", "scripting", "storage", "contextMenus"], description: "Short.",
    browser_specific_settings: { gecko: { id: "contextlens@example.org", data_collection_permissions: { required: ["none"] } } },
  };

  it("accepts a complete, clean file set and manifest", () => {
    expect(checkFileSet([...REQUIRED_FILES])).toEqual([]);
    expect(checkManifest(manifest, { version: "1.2.3", target: "firefox" })).toEqual([]);
    expect(checkManifest(manifest, { version: "1.2.3", target: "chrome" })).toEqual([]);
  });

  it("flags missing, unexpected and source-map files", () => {
    const files = REQUIRED_FILES.filter((f) => f !== "popup.js").concat(["popup.js.map", "notes.txt"]);
    const problems = checkFileSet(files).join("\n");
    expect(problems).toContain("missing file: popup.js");
    expect(problems).toContain("source map in package: popup.js.map");
    expect(problems).toContain("unexpected file in package: notes.txt");
  });

  it("refuses a placeholder Firefox id, but not for Chrome", () => {
    const placeholder = { ...manifest, browser_specific_settings: { gecko: { ...manifest.browser_specific_settings.gecko, id: "contextlens@REPLACE-BEFORE-RELEASE" } } };
    expect(checkManifest(placeholder, { version: "1.2.3", target: "firefox" }).join()).toContain("placeholder");
    expect(checkManifest(placeholder, { version: "1.2.3", target: "chrome" })).toEqual([]);
  });

  it("flags version drift, extra permissions, host access and long descriptions", () => {
    const bad = { ...manifest, permissions: [...manifest.permissions, "tabs"], host_permissions: ["<all_urls>"], description: "x".repeat(133) };
    const problems = checkManifest(bad, { version: "9.9.9", target: "chrome" }).join("\n");
    expect(problems).toContain("does not match package version");
    expect(problems).toContain("permissions differ");
    expect(problems).toContain("host access");
    expect(problems).toContain("132 characters");
  });
});
