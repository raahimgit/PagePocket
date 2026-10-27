import { beforeEach, describe, expect, it } from "vitest";
import type { Repository } from "../src/storage/repository";
import type { Collection, Item, Note } from "../src/shared/types";

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, type: "excerpt", content: `content ${id}`, capturedAt: "2026-10-05T00:00:00.000Z",
  source: { url: "https://example.com/a", pageTitle: "A" }, tags: [], collectionIds: [], ...over,
});
const collection = (id: string): Collection => ({ id, name: id, createdAt: "t", updatedAt: "t" });
const note = (id: string, target: Note["target"]): Note => ({ id, target, body: "b", createdAt: "t", updatedAt: "t" });

export function repositoryContract(name: string, create: () => Promise<Repository> | Repository): void {
  describe(`Repository contract: ${name}`, () => {
    let repo: Repository;
    beforeEach(async () => { repo = await create(); });

    it("round-trips items and returns undefined for missing ids", async () => {
      await repo.putItem(item("i1", { language: "sql", tags: ["a"] }));
      expect(await repo.getItem("i1")).toEqual(item("i1", { language: "sql", tags: ["a"] }));
      expect(await repo.getItem("nope")).toBeUndefined();
    });

    it("overwrites on put with the same id", async () => {
      await repo.putItem(item("i1"));
      await repo.putItem(item("i1", { content: "changed" }));
      expect(await repo.listItems()).toHaveLength(1);
      expect((await repo.getItem("i1"))?.content).toBe("changed");
    });

    it("returns copies, not references", async () => {
      await repo.putItem(item("i1"));
      const read = (await repo.getItem("i1"))!;
      read.content = "mutated";
      expect((await repo.getItem("i1"))?.content).toBe("content i1");
    });

    it("deleting an item removes its notes only", async () => {
      await repo.putItem(item("i1"));
      await repo.putItem(item("i2"));
      await repo.putNote(note("n1", { kind: "item", id: "i1" }));
      await repo.putNote(note("n2", { kind: "item", id: "i2" }));
      await repo.deleteItem("i1");
      expect((await repo.listNotes()).map((n) => n.id)).toEqual(["n2"]);
      expect(await repo.getItem("i1")).toBeUndefined();
    });

    it("deleting a collection removes its notes and membership but keeps items", async () => {
      await repo.putCollection(collection("c1"));
      await repo.putCollection(collection("c2"));
      await repo.putItem(item("i1", { collectionIds: ["c1", "c2"] }));
      await repo.putNote(note("n1", { kind: "collection", id: "c1" }));
      await repo.putNote(note("n2", { kind: "collection", id: "c2" }));
      await repo.deleteCollection("c1");
      expect((await repo.getItem("i1"))?.collectionIds).toEqual(["c2"]);
      expect((await repo.listNotes()).map((n) => n.id)).toEqual(["n2"]);
      expect((await repo.listCollections()).map((c) => c.id)).toEqual(["c2"]);
    });

    it("applyBundle merges without touching other records", async () => {
      await repo.putItem(item("keep"));
      await repo.applyBundle({ items: [item("new")], notes: [note("n1", { kind: "item", id: "new" })], collections: [collection("c1")] }, "merge");
      expect((await repo.listItems()).map((i) => i.id).sort()).toEqual(["keep", "new"]);
      expect(await repo.listNotes()).toHaveLength(1);
      expect(await repo.listCollections()).toHaveLength(1);
    });

    it("applyBundle in replace mode clears first", async () => {
      await repo.putItem(item("old"));
      await repo.putCollection(collection("oldc"));
      await repo.applyBundle({ items: [item("new")], notes: [], collections: [] }, "replace");
      expect((await repo.listItems()).map((i) => i.id)).toEqual(["new"]);
      expect(await repo.listCollections()).toEqual([]);
    });

    it("applyBundle is atomic: a bad record rolls everything back", async () => {
      await repo.putItem(item("old"));
      await repo.putCollection(collection("oldc"));
      const bad = { ...item("bad"), id: undefined } as unknown as Item;
      await expect(repo.applyBundle({ items: [item("fine"), bad], notes: [], collections: [collection("c2")] }, "replace")).rejects.toBeInstanceOf(Error);
      expect((await repo.listItems()).map((i) => i.id)).toEqual(["old"]);
      expect((await repo.listCollections()).map((c) => c.id)).toEqual(["oldc"]);
    });

    it("lists notes per target kind and id", async () => {
      await repo.putNote(note("n1", { kind: "item", id: "x" }));
      await repo.putNote(note("n2", { kind: "collection", id: "x" }));
      expect((await repo.listNotesForTarget({ kind: "item", id: "x" })).map((n) => n.id)).toEqual(["n1"]);
      expect((await repo.listNotesForTarget({ kind: "collection", id: "x" })).map((n) => n.id)).toEqual(["n2"]);
    });
  });
}
