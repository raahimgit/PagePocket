import { beforeEach, describe, expect, it } from "vitest";
import { Library } from "../src/library/library";
import type { PageCapture } from "../src/shared/types";
import { MemoryRepository } from "./memory-repository";

const capture = (title = "Transactions", selection = "Read committed is the default"): PageCapture => ({
  source: { url: "https://example.com/docs/tx", pageTitle: title },
  metadata: {}, headings: [], links: [], codeBlocks: [], selection: { text: selection }, warnings: [],
});

let library: Library;
let changes: number;
let counter: number;

beforeEach(() => {
  counter = 0;
  changes = 0;
  library = new Library(new MemoryRepository(), {
    now: () => new Date(`2026-10-05T10:00:0${counter % 10}.000Z`),
    newId: () => `id-${++counter}`,
    onChange: () => { changes++; },
  });
});

describe("tags", () => {
  it("normalizes on save and merges into an existing duplicate", async () => {
    const first = await library.save(capture(), { kind: "selection" }, undefined, ["PostgreSQL", "#MVCC"]);
    expect(first.item.tags).toEqual(["postgresql", "mvcc"]);
    const again = await library.save(capture(), { kind: "selection" }, undefined, ["isolation", "mvcc"]);
    expect(again.created).toBe(false);
    expect(again.item.tags).toEqual(["postgresql", "mvcc", "isolation"]);
  });

  it("rejects invalid tags before writing anything", async () => {
    await expect(library.save(capture(), { kind: "selection" }, undefined, ["???"])).rejects.toMatchObject({ code: "invalid-input" });
    expect(await library.listItems()).toHaveLength(0);
  });

  it("adds, removes and replaces tags, and enforces the per-item limit", async () => {
    const { item } = await library.save(capture(), { kind: "selection" });
    await library.addTags(item.id, ["a", "b"]);
    expect((await library.removeTag(item.id, "A")).tags).toEqual(["b"]);
    expect((await library.setTags(item.id, ["x", "y"])).tags).toEqual(["x", "y"]);
    const many = Array.from({ length: 31 }, (_, i) => `t${i}`);
    await expect(library.setTags(item.id, many)).rejects.toMatchObject({ code: "invalid-input" });
    await expect(library.addTags("ghost", ["a"])).rejects.toMatchObject({ code: "not-found" });
  });

  it("counts tags across items", async () => {
    await library.save(capture("A", "one"), { kind: "selection" }, undefined, ["sql", "db"]);
    await library.save(capture("B", "two"), { kind: "selection" }, undefined, ["sql"]);
    expect(await library.listTags()).toEqual([{ tag: "sql", count: 2 }, { tag: "db", count: 1 }]);
  });
});

describe("search", () => {
  it("reflects every kind of mutation immediately", async () => {
    const { item } = await library.save(capture(), { kind: "selection" });
    expect(await library.search("vacuum")).toHaveLength(0);

    await library.addNote({ kind: "item", id: item.id }, "check vacuum settings");
    expect((await library.search("vacuum")).map((r) => r.item.id)).toEqual([item.id]);

    await library.addTags(item.id, ["maintenance"]);
    expect(await library.search("tag:maintenance")).toHaveLength(1);

    const col = await library.createCollection("Ops");
    await library.addToCollection(item.id, col.id);
    expect(await library.search("committed", { collectionId: col.id })).toHaveLength(1);

    await library.deleteItem(item.id);
    expect(await library.search("committed")).toHaveLength(0);
  });

  it("drops the cached index on external invalidation and notifies listeners", async () => {
    const repo = new MemoryRepository();
    const a = new Library(repo, { newId: () => `a-${++counter}` });
    const b = new Library(repo, { newId: () => `b-${++counter}` });
    let notified = 0;
    b.onExternalChange(() => { notified++; });

    expect(await b.search("committed")).toHaveLength(0);
    await a.save(capture(), { kind: "selection" });
    expect(await b.search("committed")).toHaveLength(0);
    b.invalidate();
    expect(notified).toBe(1);
    expect(await b.search("committed")).toHaveLength(1);
  });

  it("signals change on mutations but not on reads or no-op saves", async () => {
    await library.save(capture(), { kind: "selection" });
    const after = changes;
    await library.search("x");
    await library.listItems();
    await library.save(capture(), { kind: "selection" });
    expect(changes).toBe(after);
  });
});
