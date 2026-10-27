import { beforeEach, describe, expect, it } from "vitest";
import { Library } from "../src/library/library";
import type { ExportBundle, PageCapture } from "../src/shared/types";
import { collection, item, note } from "./fixtures";
import { MemoryRepository } from "./memory-repository";

const capture = (url: string, title: string, text: string): PageCapture => ({
  source: { url, pageTitle: title }, metadata: {}, headings: [], links: [], codeBlocks: [],
  selection: { text }, warnings: [],
});

const bundle = (over: Partial<ExportBundle> = {}): ExportBundle => ({
  schemaVersion: 1, exportedAt: "2026-10-06T00:00:00.000Z", items: [], notes: [], collections: [], ...over,
});

let counter = 0;
const make = () => new Library(new MemoryRepository(), { newId: () => `id-${++counter}` });
const state = async (l: Library) => {
  const b = await l.exportBundle();
  return { items: b.items, notes: b.notes, collections: b.collections };
};

let library: Library;
beforeEach(() => { library = make(); });

describe("import", () => {
  it("restores an export into an empty library exactly", async () => {
    const source = make();
    const col = await source.createCollection("Research");
    const { item: saved } = await source.save(capture("https://example.com/a", "A", "text"), { kind: "selection" }, col.id, ["x"]);
    await source.addNote({ kind: "item", id: saved.id }, "n");
    await source.addNote({ kind: "collection", id: col.id }, "c");

    const stats = await library.importBundle(await source.exportBundle(), "merge");
    expect(stats.items.added).toBe(1);
    expect(stats.collections.added).toBe(1);
    expect(stats.notes.added).toBe(2);
    expect(await state(library)).toEqual(await state(source));
  });

  it("is idempotent: importing the same file twice changes nothing", async () => {
    const data = bundle({
      collections: [collection("c1", "C")],
      items: [item("i1", { collectionIds: ["c1"], tags: ["a"] })],
      notes: [note("n1", { kind: "item", id: "i1" })],
    });
    await library.importBundle(data, "merge");
    const before = await state(library);
    const again = await library.importBundle(data, "merge");
    expect(again.items).toEqual({ added: 0, merged: 0, skipped: 1 });
    expect(again.notes).toEqual({ added: 0, skipped: 1 });
    expect(again.collections).toEqual({ added: 0, merged: 0, skipped: 1 });
    expect(await state(library)).toEqual(before);
  });

  it("lets existing records win on id conflicts", async () => {
    await library.importBundle(bundle({ items: [item("i1", { tags: ["mine"], content: "original" })] }), "merge");
    const stats = await library.importBundle(bundle({ items: [item("i1", { tags: ["theirs"], content: "changed" })] }), "merge");
    expect(stats.items.skipped).toBe(1);
    const [kept] = (await state(library)).items;
    expect(kept).toMatchObject({ content: "original", tags: ["mine"] });
  });

  it("merges identical captures with different ids and moves their notes along", async () => {
    const existing = await library.save(capture("https://example.com/a", "A", "same text"), { kind: "selection" }, undefined, ["old"]);
    const incoming = item("other-id", { content: "same text", source: { url: "https://example.com/a?utm_source=x#frag", pageTitle: "A" }, tags: ["new"] });
    const stats = await library.importBundle(
      bundle({ items: [incoming], notes: [note("n1", { kind: "item", id: "other-id" }, "imported note")] }),
      "merge",
    );
    expect(stats.items).toEqual({ added: 0, merged: 1, skipped: 0 });
    const s = await state(library);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.tags).toEqual(["old", "new"]);
    expect(s.notes).toMatchObject([{ target: { kind: "item", id: existing.item.id }, body: "imported note" }]);
  });

  it("matches collections by name so names stay unique and memberships follow", async () => {
    const existing = await library.createCollection("Postgres");
    const stats = await library.importBundle(
      bundle({ collections: [collection("remote", "postgres")], items: [item("i1", { collectionIds: ["remote"] })] }),
      "merge",
    );
    expect(stats.collections).toEqual({ added: 0, merged: 1, skipped: 0 });
    const s = await state(library);
    expect(s.collections).toHaveLength(1);
    expect(s.items[0]!.collectionIds).toEqual([existing.id]);
  });

  it("collapses duplicate names inside the file", async () => {
    const stats = await library.importBundle(bundle({ collections: [collection("a", "Same"), collection("b", "same")] }), "merge");
    expect(stats.collections).toEqual({ added: 1, merged: 1, skipped: 0 });
  });

  it("skips duplicate notes and notes whose targets cannot be resolved", async () => {
    await library.importBundle(bundle({ items: [item("i1")], notes: [note("n1", { kind: "item", id: "i1" }, "dup")] }), "merge");
    const stats = await library.importBundle(
      bundle({ items: [item("i1")], notes: [note("n2", { kind: "item", id: "i1" }, "dup"), note("n3", { kind: "item", id: "ghost" }, "x")] }),
      "merge",
    );
    expect(stats.notes).toEqual({ added: 0, skipped: 2 });
  });

  it("replace mode swaps everything and reports what is deleted", async () => {
    const col = await library.createCollection("Old");
    const { item: old } = await library.save(capture("https://example.com/old", "Old", "old"), { kind: "selection" }, col.id);
    await library.addNote({ kind: "item", id: old.id }, "old note");

    const stats = await library.importBundle(bundle({ items: [item("new1")], collections: [collection("c9", "New")] }), "replace");
    expect(stats.deleted).toEqual({ items: 1, notes: 1, collections: 1 });
    const s = await state(library);
    expect(s.items.map((i) => i.id)).toEqual(["new1"]);
    expect(s.collections.map((c) => c.id)).toEqual(["c9"]);
    expect(s.notes).toEqual([]);
  });

  it("previews without writing", async () => {
    const stats = await library.previewImport(bundle({ items: [item("i1")] }), "merge");
    expect(stats.items.added).toBe(1);
    expect((await state(library)).items).toEqual([]);
  });

  it("makes imported items searchable immediately", async () => {
    expect(await library.search("needle")).toEqual([]);
    await library.importBundle(bundle({ items: [item("i1", { content: "a needle here" })] }), "merge");
    expect((await library.search("needle")).map((r) => r.item.id)).toEqual(["i1"]);
  });
});

describe("export", () => {
  it("is deterministic regardless of insertion order", async () => {
    const a = make();
    const b = make();
    const items = [item("x", { capturedAt: "2026-10-02T00:00:00.000Z" }), item("y", { capturedAt: "2026-10-01T00:00:00.000Z" })];
    await a.importBundle(bundle({ items }), "merge");
    await b.importBundle(bundle({ items: [...items].reverse() }), "merge");
    expect((await a.exportBundle()).items).toEqual((await b.exportBundle()).items);
    expect((await a.exportBundle()).items.map((i) => i.id)).toEqual(["y", "x"]);
  });

  it("exports Markdown for one collection, or everything", async () => {
    const col = await library.createCollection("Scoped");
    await library.save(capture("https://example.com/in", "In", "inside"), { kind: "selection" }, col.id);
    await library.save(capture("https://example.com/out", "Out", "outside"), { kind: "selection" });
    const scoped = await library.exportMarkdown(col.id);
    expect(scoped.filename).toBe("scoped.md");
    expect(scoped.text).toContain("inside");
    expect(scoped.text.includes("outside")).toBe(false);
    const all = await library.exportMarkdown();
    expect(all.text).toContain("outside");
    await expect(library.exportMarkdown("ghost")).rejects.toMatchObject({ code: "not-found" });
  });
});
