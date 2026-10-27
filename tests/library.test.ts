import { beforeEach, describe, expect, it } from "vitest";
import { Library, LibraryError } from "../src/library/library";
import type { PageCapture } from "../src/shared/types";
import { MemoryRepository } from "./memory-repository";

const capture = (over: Partial<PageCapture> = {}): PageCapture => ({
  source: { url: "https://example.com/docs/tx?utm_source=x#top", pageTitle: "Transactions" },
  metadata: { description: "About transactions" },
  headings: [{ level: 2, text: "Isolation", id: "iso", url: "https://example.com/docs/tx#iso" }],
  links: [{ url: "https://github.com/postgres/postgres", text: "Repo" }],
  codeBlocks: [{ content: "SELECT 1;", language: "sql", headingContext: "Isolation" }],
  selection: { text: "Read committed", headingContext: "Isolation" },
  warnings: [],
  ...over,
});

let library: Library;
let counter: number;

beforeEach(() => {
  counter = 0;
  library = new Library(new MemoryRepository(), {
    now: () => new Date("2026-10-05T10:00:00.000Z"),
    newId: () => `id-${++counter}`,
  });
});

describe("saving", () => {
  it("saves screenshots as first-class local items and attaches a note", async () => {
    const result = await library.saveScreenshot(capture(), "data:image/png;base64,AA==", undefined, ["visual"], "Why this diagram matters");
    expect(result.item).toMatchObject({ type: "screenshot", content: "data:image/png;base64,AA==", tags: ["visual"] });
    expect((await library.listNotes())[0]?.body).toBe("Why this diagram matters");
    expect((await library.search("visual"))[0]?.item.id).toBe(result.item.id);
  });

  it("builds every item type with its source intact", async () => {
    const c = capture();
    const page = (await library.save(c, { kind: "page" })).item;
    const excerpt = (await library.save(c, { kind: "selection" })).item;
    const code = (await library.save(c, { kind: "code", index: 0 })).item;
    const heading = (await library.save(c, { kind: "heading", index: 0 })).item;
    const link = (await library.save(c, { kind: "link", index: 0 })).item;

    expect([page, excerpt, code, heading, link].map((i) => i.type)).toEqual(["page", "excerpt", "code", "heading", "link"]);
    for (const item of [page, excerpt, code, heading, link]) {
      expect(item.source).toEqual(c.source);
      expect(item.capturedAt).toBe("2026-10-05T10:00:00.000Z");
    }
    expect(excerpt).toMatchObject({ content: "Read committed", headingContext: "Isolation" });
    expect(code).toMatchObject({ language: "sql", content: "SELECT 1;" });
    expect(heading.targetUrl).toBe("https://example.com/docs/tx#iso");
    expect(link.targetUrl).toBe("https://github.com/postgres/postgres");
  });

  it("does not duplicate the same capture, and adds it to a new collection", async () => {
    const col = await library.createCollection("PostgreSQL");
    const first = await library.save(capture(), { kind: "selection" });
    const again = await library.save(capture({ source: { url: "https://example.com/docs/tx#other", pageTitle: "Transactions" } }), { kind: "selection" }, col.id);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.item.id).toBe(first.item.id);
    expect(again.item.collectionIds).toEqual([col.id]);
    expect(await library.listItems()).toHaveLength(1);
  });

  it("rejects bad specs and unknown collections", async () => {
    await expect(library.save(capture({ selection: null }), { kind: "selection" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(library.save(capture(), { kind: "code", index: 5 })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(library.save(capture(), { kind: "page" }, "missing")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("collections", () => {
  it("validates and de-duplicates names case-insensitively", async () => {
    await library.createCollection("  Postgres   Research ");
    await expect(library.createCollection("postgres research")).rejects.toMatchObject({ code: "duplicate-name" });
    await expect(library.createCollection("   ")).rejects.toMatchObject({ code: "invalid-input" });
    await expect(library.createCollection("x".repeat(101))).rejects.toBeInstanceOf(LibraryError);
    expect((await library.listCollections()).map((c) => c.name)).toEqual(["Postgres Research"]);
  });

  it("renames, allowing the same name on the same collection", async () => {
    const a = await library.createCollection("A");
    await library.createCollection("B");
    expect((await library.renameCollection(a.id, "a")).name).toBe("a");
    await expect(library.renameCollection(a.id, "b")).rejects.toMatchObject({ code: "duplicate-name" });
  });

  it("deleting a collection keeps its items", async () => {
    const col = await library.createCollection("Temp");
    const { item } = await library.save(capture(), { kind: "page" }, col.id);
    await library.deleteCollection(col.id);
    const kept = await library.listItems();
    expect(kept.map((i) => i.id)).toEqual([item.id]);
    expect(kept[0]?.collectionIds).toEqual([]);
  });

  it("filters items by collection and supports add/remove", async () => {
    const col = await library.createCollection("C");
    const a = (await library.save(capture(), { kind: "page" })).item;
    await library.save(capture(), { kind: "selection" });
    await library.addToCollection(a.id, col.id);
    expect((await library.listItems({ collectionId: col.id })).map((i) => i.id)).toEqual([a.id]);
    await library.removeFromCollection(a.id, col.id);
    expect(await library.listItems({ collectionId: col.id })).toEqual([]);
  });
});

describe("notes", () => {
  it("attaches to items and collections, and cascades on delete", async () => {
    const col = await library.createCollection("C");
    const { item } = await library.save(capture(), { kind: "selection" });
    await library.addNote({ kind: "item", id: item.id }, "  why this matters ");
    await library.addNote({ kind: "collection", id: col.id }, "scope");
    expect((await library.notesFor({ kind: "item", id: item.id })).map((n) => n.body)).toEqual(["why this matters"]);
    await library.deleteItem(item.id);
    expect(await library.listNotes()).toHaveLength(1);
  });

  it("validates targets and bodies, and updates timestamps", async () => {
    await expect(library.addNote({ kind: "item", id: "ghost" }, "x")).rejects.toMatchObject({ code: "not-found" });
    const { item } = await library.save(capture(), { kind: "page" });
    await expect(library.addNote({ kind: "item", id: item.id }, "  ")).rejects.toMatchObject({ code: "invalid-input" });
    const note = await library.addNote({ kind: "item", id: item.id }, "one");
    const edited = await library.updateNote(note.id, "two");
    expect(edited).toMatchObject({ body: "two", createdAt: note.createdAt });
    await expect(library.updateNote("ghost", "x")).rejects.toMatchObject({ code: "not-found" });
  });
});
