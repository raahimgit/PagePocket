import { describe, expect, it } from "vitest";
import { Library } from "../src/library/library";
import { LIMITS, parseBundle, validateBundle } from "../src/portability/validate";
import { collection, item, note } from "./fixtures";
import { MemoryRepository } from "./memory-repository";

const valid = () => ({
  schemaVersion: 1, exportedAt: "2026-10-06T00:00:00.000Z",
  collections: [collection("c1", "C")],
  items: [item("i1", { collectionIds: ["c1"], tags: ["sql"] })],
  notes: [note("n1", { kind: "item", id: "i1" })],
});
const errorsFor = (raw: unknown) => {
  const r = validateBundle(raw);
  return r.ok ? [] : r.errors;
};

describe("parseBundle", () => {
  it("round-trips a real export unchanged", async () => {
    const library = new Library(new MemoryRepository());
    const col = await library.createCollection("PostgreSQL");
    const { item: saved } = await library.save(
      { source: { url: "https://example.com/a", pageTitle: "A", canonicalUrl: "https://example.com/a" }, metadata: {}, headings: [], links: [],
        codeBlocks: [{ content: "SELECT 1;", language: "sql", headingContext: "H" }], selection: null, warnings: [] },
      { kind: "code", index: 0 }, col.id, ["db"],
    );
    await library.addNote({ kind: "item", id: saved.id }, "hello");
    await library.addNote({ kind: "collection", id: col.id }, "scope");

    const exported = await library.exportBundle();
    const parsed = parseBundle(JSON.stringify(exported));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.bundle).toEqual(exported);
      expect(parsed.warnings).toEqual([]);
    }
  });

  it.each(["{bad", "", "null", "[]", '"text"', "42", "{}", '{"schemaVersion":"1"}', '{"schemaVersion":0}', '{"schemaVersion":1.5}'])(
    "rejects %s",
    (input) => expect(parseBundle(input).ok).toBe(false),
  );

  it("refuses files from a newer format", () => {
    expect(errorsFor({ ...valid(), schemaVersion: 2 })[0]).toContain("Update PagePocket");
  });

  it("refuses oversized input", () => {
    expect(parseBundle("x".repeat(LIMITS.fileChars + 1)).ok).toBe(false);
  });
});

describe("validateBundle", () => {
  it("accepts a minimal valid bundle", () => {
    expect(validateBundle(valid()).ok).toBe(true);
    expect(validateBundle({ schemaVersion: 1, items: [], notes: [], collections: [] }).ok).toBe(true);
  });

  it("requires arrays", () => {
    expect(errorsFor({ schemaVersion: 1, items: {}, notes: [], collections: [] })[0]).toContain("items");
    expect(errorsFor({ schemaVersion: 1, items: [] })).toHaveLength(2);
  });

  it("requires a source on every item", () => {
    const bad = valid();
    delete (bad.items[0] as Partial<typeof bad.items[0]>).source;
    expect(errorsFor(bad).join("\n")).toContain("source");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "chrome://settings", "not a url", ""])("rejects source url %s", (url) => {
    const bad = valid();
    bad.items[0]!.source.url = url;
    expect(errorsFor(bad).join("\n")).toContain("source.url");
  });

  it("rejects non-http target and canonical URLs", () => {
    const bad = valid();
    bad.items[0]!.targetUrl = "file:///etc/passwd";
    bad.items[0]!.source.canonicalUrl = "javascript:1";
    expect(errorsFor(bad)).toHaveLength(2);
  });

  it("rejects wrong types, bad dates, unknown item types and oversized fields", () => {
    const cases: [(b: ReturnType<typeof valid>) => void, string][] = [
      [(b) => { (b.items[0] as any).type = "video"; }, "type"],
      [(b) => { (b.items[0] as any).content = 5; }, "content"],
      [(b) => { b.items[0]!.capturedAt = "yesterday"; }, "capturedAt"],
      [(b) => { b.items[0]!.content = "x".repeat(LIMITS.content + 1); }, "content"],
      [(b) => { (b.items[0] as any).tags = "sql"; }, "tags"],
      [(b) => { b.items[0]!.tags = ["???"]; }, "tags[0]"],
      [(b) => { b.items[0]!.id = "../../etc"; }, "id"],
      [(b) => { b.notes[0]!.body = "   "; }, "body"],
      [(b) => { (b.notes[0] as any).target = { kind: "page", id: "x" }; }, "target.kind"],
      [(b) => { b.collections[0]!.name = ""; }, "name"],
      [(b) => { (b.items as any[]).push(42); }, "items[1]"],
    ];
    for (const [mutate, expected] of cases) {
      const bad = structuredClone(valid());
      mutate(bad);
      expect(errorsFor(bad).join("\n")).toContain(expected);
    }
  });

  it("rejects duplicate ids", () => {
    const bad = valid();
    bad.items.push(item("i1"));
    expect(errorsFor(bad).join("\n")).toContain("duplicates");
  });

  it("caps the number of reported errors", () => {
    const bad = valid();
    bad.items = Array.from({ length: 500 }, () => ({}) as any);
    const errors = errorsFor(bad);
    expect(errors.length <= LIMITS.errors + 1).toBe(true);
    expect(errors[errors.length - 1]).toContain("not listed");
  });

  it("normalizes tags and dates, and strips unknown fields", () => {
    const raw: any = valid();
    raw.items[0].tags = ["SQL", "#sql", "Row Level"];
    raw.items[0].capturedAt = "2026-10-05T10:00:00+02:00";
    raw.items[0].evil = "x";
    raw.items[0].source.extra = "y";
    raw.extra = "z";
    const result = validateBundle(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.items[0]).toEqual(item("i1", { collectionIds: ["c1"], tags: ["sql", "row-level"], capturedAt: "2026-10-05T08:00:00.000Z" }));
      expect(Object.keys(result.bundle).sort()).toEqual(["collections", "exportedAt", "items", "notes", "schemaVersion"]);
    }
  });

  it("is not affected by prototype-pollution payloads", () => {
    const raw = JSON.parse(
      '{"__proto__":{"polluted":true},"schemaVersion":1,"collections":[],"notes":[],"items":[{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},' +
        '"id":"i1","type":"page","content":"","capturedAt":"2026-10-05T10:00:00.000Z","tags":[],"collectionIds":[],"source":{"url":"https://a.com","pageTitle":"t"}}]}',
    );
    const result = validateBundle(raw);
    expect(result.ok).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
    if (result.ok) expect((result.bundle.items[0] as any).polluted).toBeUndefined();
  });

  it("repairs dangling references with warnings instead of storing them", () => {
    const raw: any = valid();
    raw.items[0].collectionIds = ["c1", "ghost"];
    raw.notes.push(note("n2", { kind: "item", id: "ghost" }), note("n3", { kind: "collection", id: "ghost" }));
    const result = validateBundle(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.items[0]!.collectionIds).toEqual(["c1"]);
      expect(result.bundle.notes.map((n) => n.id)).toEqual(["n1"]);
      expect(result.warnings).toHaveLength(2);
    }
  });
});
