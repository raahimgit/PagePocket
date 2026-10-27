import { describe, expect, it } from "vitest";
import { IdbRepository } from "../src/storage/idb";
import { item } from "./fixtures";

export function idbSpecific(label: string, makeFactory: () => IDBFactory, uniqueName: () => string): void {
  describe(`IndexedDB specifics: ${label}`, () => {
    it("persists across repository instances", async () => {
      const factory = makeFactory();
      const name = uniqueName();
      await new IdbRepository(name, factory).putItem(item("i1"));
      expect((await new IdbRepository(name, factory).getItem("i1"))?.id).toBe("i1");
    });

    it("does not block a schema upgrade opened elsewhere", async () => {
      const factory = makeFactory();
      const name = uniqueName();
      const repo = new IdbRepository(name, factory);
      await repo.putItem(item("i1"));
      const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(name, 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("upgrade was blocked by an open ContextLens connection"));
      });
      upgraded.close();
      expect(upgraded.version).toBe(2);
    });

    it("keeps every write when many are in flight at once", async () => {
      const repo = new IdbRepository(uniqueName(), makeFactory());
      await Promise.all(Array.from({ length: 60 }, (_, i) => repo.putItem(item(`i${i}`))));
      expect(await repo.listItems()).toHaveLength(60);
    });

    it("treats deleting something that does not exist as a no-op", async () => {
      const repo = new IdbRepository(uniqueName(), makeFactory());
      await repo.putItem(item("keep"));
      await repo.deleteItem("ghost");
      await repo.deleteCollection("ghost");
      await repo.deleteNote("ghost");
      expect((await repo.listItems()).map((i) => i.id)).toEqual(["keep"]);
    });
  });
}
