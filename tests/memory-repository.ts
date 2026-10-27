import type { BundleData, Repository } from "../src/storage/repository";
import type { Collection, Item, Note, NoteTarget } from "../src/shared/types";

export class MemoryRepository implements Repository {
  private items = new Map<string, Item>();
  private notes = new Map<string, Note>();
  private collections = new Map<string, Collection>();

  async putItem(item: Item) { this.items.set(item.id, structuredClone(item)); }
  async getItem(id: string) { return structuredClone(this.items.get(id)); }
  async listItems() { return structuredClone([...this.items.values()]); }
  async deleteItem(id: string) {
    this.items.delete(id);
    for (const note of [...this.notes.values()]) if (note.target.kind === "item" && note.target.id === id) this.notes.delete(note.id);
  }

  async putNote(note: Note) { this.notes.set(note.id, structuredClone(note)); }
  async getNote(id: string) { return structuredClone(this.notes.get(id)); }
  async deleteNote(id: string) { this.notes.delete(id); }
  async listNotes() { return structuredClone([...this.notes.values()]); }
  async listNotesForTarget(target: NoteTarget) {
    return structuredClone([...this.notes.values()].filter((n) => n.target.kind === target.kind && n.target.id === target.id));
  }

  async putCollection(c: Collection) { this.collections.set(c.id, structuredClone(c)); }
  async getCollection(id: string) { return structuredClone(this.collections.get(id)); }
  async listCollections() { return structuredClone([...this.collections.values()]); }
  async deleteCollection(id: string) {
    this.collections.delete(id);
    for (const note of [...this.notes.values()]) if (note.target.kind === "collection" && note.target.id === id) this.notes.delete(note.id);
    for (const item of this.items.values()) item.collectionIds = item.collectionIds.filter((c) => c !== id);
  }

  async applyBundle(data: BundleData, mode: "merge" | "replace") {
    for (const record of [...data.items, ...data.notes, ...data.collections]) {
      if (typeof record.id !== "string") throw new Error("Invalid record");
    }
    if (mode === "replace") {
      this.items.clear();
      this.notes.clear();
      this.collections.clear();
    }
    for (const c of data.collections) this.collections.set(c.id, structuredClone(c));
    for (const i of data.items) this.items.set(i.id, structuredClone(i));
    for (const n of data.notes) this.notes.set(n.id, structuredClone(n));
  }
}
