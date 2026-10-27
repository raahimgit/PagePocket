import type { Collection, Item, Note, NoteTarget } from "../shared/types";
import type { BundleData, Repository } from "./repository";

export const DB_NAME = "contextlens";
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

function open(name: string, factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const items = db.createObjectStore("items", { keyPath: "id" });
      items.createIndex("capturedAt", "capturedAt");
      items.createIndex("collectionIds", "collectionIds", { multiEntry: true });
      const notes = db.createObjectStore("notes", { keyPath: "id" });
      notes.createIndex("targetId", "target.id");
      db.createObjectStore("collections", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Database upgrade blocked by another open context"));
  });
}

export class IdbRepository implements Repository {
  private db: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly name = DB_NAME,
    private readonly factory: IDBFactory = indexedDB,
  ) {}

  private connection(): Promise<IDBDatabase> {
    this.db ??= open(this.name, this.factory).then((db) => {
      // A newer version opened elsewhere (extension update) must not be blocked by this tab.
      db.onversionchange = () => {
        db.close();
        this.db = undefined;
      };
      return db;
    });
    return this.db;
  }

  private async write<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const tx = (await this.connection()).transaction(store, "readwrite");
    const result = request(fn(tx.objectStore(store)));
    await finished(tx);
    return result;
  }

  private async read<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const tx = (await this.connection()).transaction(store, "readonly");
    return request(fn(tx.objectStore(store)));
  }

  async putItem(item: Item) { await this.write("items", (s) => s.put(item)); }
  getItem(id: string) { return this.read<Item | undefined>("items", (s) => s.get(id)); }
  listItems() { return this.read<Item[]>("items", (s) => s.getAll()); }

  async deleteItem(id: string) {
    const tx = (await this.connection()).transaction(["items", "notes"], "readwrite");
    tx.objectStore("items").delete(id);
    const notes = tx.objectStore("notes");
    const keys = await request(notes.index("targetId").getAllKeys(IDBKeyRange.only(id)));
    for (const key of keys) notes.delete(key);
    await finished(tx);
  }

  async putNote(note: Note) { await this.write("notes", (s) => s.put(note)); }
  getNote(id: string) { return this.read<Note | undefined>("notes", (s) => s.get(id)); }
  async deleteNote(id: string) { await this.write("notes", (s) => s.delete(id)); }
  listNotes() { return this.read<Note[]>("notes", (s) => s.getAll()); }

  async listNotesForTarget(target: NoteTarget) {
    const notes = await this.read<Note[]>("notes", (s) => s.index("targetId").getAll(IDBKeyRange.only(target.id)));
    return notes.filter((n) => n.target.kind === target.kind);
  }

  async putCollection(collection: Collection) { await this.write("collections", (s) => s.put(collection)); }
  getCollection(id: string) { return this.read<Collection | undefined>("collections", (s) => s.get(id)); }
  listCollections() { return this.read<Collection[]>("collections", (s) => s.getAll()); }

  async deleteCollection(id: string) {
    const tx = (await this.connection()).transaction(["items", "notes", "collections"], "readwrite");
    tx.objectStore("collections").delete(id);

    const notes = tx.objectStore("notes");
    const noteKeys = await request(notes.index("targetId").getAllKeys(IDBKeyRange.only(id)));
    for (const key of noteKeys) notes.delete(key);

    const items = tx.objectStore("items");
    const members = await request<Item[]>(items.index("collectionIds").getAll(IDBKeyRange.only(id)));
    for (const item of members) {
      items.put({ ...item, collectionIds: item.collectionIds.filter((c) => c !== id) });
    }
    await finished(tx);
  }

  async applyBundle(data: BundleData, mode: "merge" | "replace") {
    const names = ["items", "notes", "collections"] as const;
    const tx = (await this.connection()).transaction([...names], "readwrite");
    const done = finished(tx);
    done.catch(() => undefined);
    try {
      if (mode === "replace") for (const name of names) tx.objectStore(name).clear();
      for (const collection of data.collections) tx.objectStore("collections").put(collection);
      for (const item of data.items) tx.objectStore("items").put(item);
      for (const note of data.notes) tx.objectStore("notes").put(note);
    } catch (error) {
      // put() throws synchronously on an invalid record; without an explicit
      // abort the writes queued so far would still commit.
      tx.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  }
}
