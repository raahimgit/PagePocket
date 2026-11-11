import { planImport, type ImportMode, type ImportStats } from "../portability/merge";
import { renderMarkdown, slugify } from "../portability/markdown";
import { SCHEMA_VERSION, type Collection, type ExportBundle, type Item, type Note, type NoteTarget, type PageCapture } from "../shared/types";
import { SearchIndex, type SearchOptions, type SearchResult } from "../search";
import type { Repository } from "../storage/repository";
import { buildItem, buildScreenshot, type ItemDraft, type SaveSpec } from "./build-item";
import { LibraryError } from "./errors";
import { itemKey } from "./identity";
import { MAX_TAGS_PER_ITEM, normalizeTagList } from "./tags";

export { LibraryError } from "./errors";
export type { SaveSpec } from "./build-item";
export type { ImportMode, ImportStats } from "../portability/merge";

const MAX_NAME = 100;
const MAX_NOTE = 10_000;

export interface SaveResult {
  item: Item;
  created: boolean;
}

export interface LibraryOptions {
  now?: () => Date;
  newId?: () => string;
  onChange?: () => void;
}

export class Library {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly onChange: (() => void) | undefined;
  private readonly externalListeners = new Set<() => void>();
  private index: Promise<SearchIndex> | undefined;

  constructor(private readonly repo: Repository, options: LibraryOptions = {}) {
    this.onChange = options.onChange;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  async save(capture: PageCapture, spec: SaveSpec, collectionId?: string, tags: string[] = [], note?: string): Promise<SaveResult> {
    const cleanTags = normalizeTagList(tags);
    if (collectionId) await this.requireCollection(collectionId);
    const draft = buildItem(capture, spec);

    const existing = (await this.repo.listItems()).find((item) => itemKey(item) === itemKey(draft));
    if (existing) {
      const collectionIds =
        collectionId && !existing.collectionIds.includes(collectionId)
          ? [...existing.collectionIds, collectionId]
          : existing.collectionIds;
      const merged = [...new Set([...existing.tags, ...cleanTags])];
      if (collectionIds === existing.collectionIds && merged.length === existing.tags.length) {
        if (note?.trim()) await this.addNote({ kind: "item", id: existing.id }, note);
        return { item: existing, created: false };
      }
      const updated = { ...existing, collectionIds, tags: this.limitTags(merged) };
      await this.repo.putItem(updated);
      this.changed();
      if (note?.trim()) await this.addNote({ kind: "item", id: updated.id }, note);
      return { item: updated, created: false };
    }

    const item: Item = {
      ...draft,
      id: this.newId(),
      capturedAt: this.now().toISOString(),
      tags: this.limitTags(cleanTags),
      collectionIds: collectionId ? [collectionId] : [],
    };
    await this.repo.putItem(item);
    this.changed();
    if (note?.trim()) await this.addNote({ kind: "item", id: item.id }, note);
    return { item, created: true };
  }

  async saveScreenshot(capture: PageCapture, dataUrl: string, collectionId?: string, tags: string[] = [], note?: string): Promise<SaveResult> {
    const cleanTags = normalizeTagList(tags);
    if (collectionId) await this.requireCollection(collectionId);
    if (!dataUrl.startsWith("data:image/")) throw new LibraryError("invalid-input", "Screenshot data is invalid");
    const draft = buildScreenshot(capture.source, dataUrl);
    const existing = (await this.repo.listItems()).find((item) => itemKey(item) === itemKey(draft));
    if (existing) {
      const collectionIds = collectionId && !existing.collectionIds.includes(collectionId) ? [...existing.collectionIds, collectionId] : existing.collectionIds;
      const tags = this.limitTags([...new Set([...existing.tags, ...cleanTags])]);
      const updated = { ...existing, collectionIds, tags };
      if (collectionIds !== existing.collectionIds || tags.length !== existing.tags.length) { await this.repo.putItem(updated); this.changed(); }
      if (note?.trim()) await this.addNote({ kind: "item", id: existing.id }, note);
      return { item: updated, created: false };
    }
    const item: Item = { ...draft, id: this.newId(), capturedAt: this.now().toISOString(), tags: this.limitTags(cleanTags), collectionIds: collectionId ? [collectionId] : [] };
    await this.repo.putItem(item); this.changed();
    if (note?.trim()) await this.addNote({ kind: "item", id: item.id }, note);
    return { item, created: true };
  }

  async listItems(filter: { collectionId?: string } = {}): Promise<Item[]> {
    const items = await this.repo.listItems();
    const scoped = filter.collectionId ? items.filter((i) => i.collectionIds.includes(filter.collectionId!)) : items;
    return scoped.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }

  async deleteItem(id: string): Promise<void> {
    await this.repo.deleteItem(id);
    this.changed();
  }

  async addToCollection(itemId: string, collectionId: string): Promise<Item> {
    await this.requireCollection(collectionId);
    const item = await this.requireItem(itemId);
    if (item.collectionIds.includes(collectionId)) return item;
    const updated = { ...item, collectionIds: [...item.collectionIds, collectionId] };
    await this.repo.putItem(updated);
    this.changed();
    return updated;
  }

  async removeFromCollection(itemId: string, collectionId: string): Promise<Item> {
    const item = await this.requireItem(itemId);
    const updated = { ...item, collectionIds: item.collectionIds.filter((c) => c !== collectionId) };
    await this.repo.putItem(updated);
    this.changed();
    return updated;
  }

  async createCollection(name: string, description?: string): Promise<Collection> {
    const clean = await this.validName(name);
    const stamp = this.now().toISOString();
    const collection: Collection = {
      id: this.newId(),
      name: clean,
      ...(description?.trim() ? { description: description.trim() } : {}),
      createdAt: stamp,
      updatedAt: stamp,
    };
    await this.repo.putCollection(collection);
    this.changed();
    return collection;
  }

  async renameCollection(id: string, name: string): Promise<Collection> {
    const existing = await this.requireCollection(id);
    const clean = await this.validName(name, id);
    const updated = { ...existing, name: clean, updatedAt: this.now().toISOString() };
    await this.repo.putCollection(updated);
    this.changed();
    return updated;
  }

  async deleteCollection(id: string): Promise<void> {
    await this.repo.deleteCollection(id);
    this.changed();
  }

  async listCollections(): Promise<Collection[]> {
    return (await this.repo.listCollections()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async addNote(target: NoteTarget, body: string): Promise<Note> {
    const clean = this.validNoteBody(body);
    if (target.kind === "item") await this.requireItem(target.id);
    else await this.requireCollection(target.id);
    const stamp = this.now().toISOString();
    const note: Note = { id: this.newId(), target, body: clean, createdAt: stamp, updatedAt: stamp };
    await this.repo.putNote(note);
    this.changed();
    return note;
  }

  async updateNote(id: string, body: string): Promise<Note> {
    const clean = this.validNoteBody(body);
    const existing = await this.repo.getNote(id);
    if (!existing) throw new LibraryError("not-found", "Note not found");
    const updated = { ...existing, body: clean, updatedAt: this.now().toISOString() };
    await this.repo.putNote(updated);
    this.changed();
    return updated;
  }

  async deleteNote(id: string): Promise<void> {
    await this.repo.deleteNote(id);
    this.changed();
  }

  async listNotes(): Promise<Note[]> {
    return (await this.repo.listNotes()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async notesFor(target: NoteTarget): Promise<Note[]> {
    return (await this.repo.listNotesForTarget(target)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addTags(itemId: string, tags: string[]): Promise<Item> {
    const item = await this.requireItem(itemId);
    const merged = [...new Set([...item.tags, ...normalizeTagList(tags)])];
    return this.writeTags(item, this.limitTags(merged));
  }

  async removeTag(itemId: string, tag: string): Promise<Item> {
    const item = await this.requireItem(itemId);
    const [clean] = normalizeTagList([tag]);
    return this.writeTags(item, item.tags.filter((t) => t !== clean));
  }

  async setTags(itemId: string, tags: string[]): Promise<Item> {
    const item = await this.requireItem(itemId);
    return this.writeTags(item, this.limitTags(normalizeTagList(tags)));
  }

  async listTags(): Promise<{ tag: string; count: number }[]> {
    const counts = new Map<string, number>();
    for (const item of await this.repo.listItems()) {
      for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    this.index ??= this.buildIndex();
    return (await this.index).search(query, options);
  }

  // Called when another extension context (popup, background) changed the data.
  invalidate(): void {
    this.index = undefined;
    for (const listener of this.externalListeners) listener();
  }

  onExternalChange(listener: () => void): () => void {
    this.externalListeners.add(listener);
    return () => this.externalListeners.delete(listener);
  }

  private buildIndex(): Promise<SearchIndex> {
    const built = Promise.all([this.repo.listItems(), this.repo.listNotes()]).then(([items, notes]) =>
      SearchIndex.build(items, notes),
    );
    built.catch(() => {
      if (this.index === built) this.index = undefined;
    });
    return built;
  }

  private changed(): void {
    this.index = undefined;
    this.onChange?.();
  }

  private limitTags(tags: string[]): string[] {
    if (tags.length > MAX_TAGS_PER_ITEM) {
      throw new LibraryError("invalid-input", `An item can have at most ${MAX_TAGS_PER_ITEM} tags`);
    }
    return tags;
  }

  private async writeTags(item: Item, tags: string[]): Promise<Item> {
    const updated = { ...item, tags };
    await this.repo.putItem(updated);
    this.changed();
    return updated;
  }

  async exportBundle(): Promise<ExportBundle> {
    const [items, notes, collections] = await Promise.all([this.repo.listItems(), this.repo.listNotes(), this.repo.listCollections()]);
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      items: items.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id)),
      notes: notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      collections: collections.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    };
  }

  async exportMarkdown(collectionId?: string): Promise<{ text: string; filename: string }> {
    const exportedAt = this.now().toISOString();
    if (!collectionId) {
      const [items, notes] = await Promise.all([this.repo.listItems(), this.repo.listNotes()]);
      return { text: renderMarkdown({ scope: null, collectionNotes: [], items, notes, exportedAt }), filename: "pagepocket-all.md" };
    }
    const collection = await this.requireCollection(collectionId);
    const [all, notes, collectionNotes] = await Promise.all([
      this.repo.listItems(), this.repo.listNotes(), this.repo.listNotesForTarget({ kind: "collection", id: collectionId }),
    ]);
    const items = all.filter((i) => i.collectionIds.includes(collectionId));
    return {
      text: renderMarkdown({ scope: collection, collectionNotes, items, notes, exportedAt }),
      filename: `${slugify(collection.name)}.md`,
    };
  }

  async previewImport(bundle: ExportBundle, mode: ImportMode): Promise<ImportStats> {
    return (await this.planImport(bundle, mode)).stats;
  }

  async importBundle(bundle: ExportBundle, mode: ImportMode): Promise<ImportStats> {
    const plan = await this.planImport(bundle, mode);
    await this.repo.applyBundle(plan.write, mode);
    this.changed();
    return plan.stats;
  }

  private async planImport(bundle: ExportBundle, mode: ImportMode) {
    const [items, notes, collections] = await Promise.all([this.repo.listItems(), this.repo.listNotes(), this.repo.listCollections()]);
    return planImport({ items, notes, collections }, bundle, mode);
  }

  private async requireItem(id: string): Promise<Item> {
    const item = await this.repo.getItem(id);
    if (!item) throw new LibraryError("not-found", "Item not found");
    return item;
  }

  private async requireCollection(id: string): Promise<Collection> {
    const collection = await this.repo.getCollection(id);
    if (!collection) throw new LibraryError("not-found", "Collection not found");
    return collection;
  }

  private async validName(name: string, ignoreId?: string): Promise<string> {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > MAX_NAME) {
      throw new LibraryError("invalid-input", `Collection names must be 1 to ${MAX_NAME} characters`);
    }
    const taken = (await this.repo.listCollections()).some(
      (c) => c.id !== ignoreId && c.name.toLowerCase() === clean.toLowerCase(),
    );
    if (taken) throw new LibraryError("duplicate-name", "A collection with that name already exists");
    return clean;
  }

  private validNoteBody(body: string): string {
    const clean = body.trim();
    if (!clean || clean.length > MAX_NOTE) {
      throw new LibraryError("invalid-input", `Notes must be 1 to ${MAX_NOTE} characters`);
    }
    return clean;
  }
}
