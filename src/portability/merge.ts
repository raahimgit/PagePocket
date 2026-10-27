import { itemKey } from "../library/identity";
import { MAX_TAGS_PER_ITEM } from "../library/tags";
import type { Collection, ExportBundle, Item, Note } from "../shared/types";

export type ImportMode = "merge" | "replace";

export interface Snapshot {
  items: Item[];
  notes: Note[];
  collections: Collection[];
}

export interface ImportStats {
  mode: ImportMode;
  items: { added: number; merged: number; skipped: number };
  collections: { added: number; merged: number; skipped: number };
  notes: { added: number; skipped: number };
  deleted: { items: number; notes: number; collections: number };
}

export interface ImportPlan {
  write: Snapshot;
  stats: ImportStats;
}

const union = (a: string[], b: string[], cap?: number): string[] => {
  const merged = [...new Set([...a, ...b])];
  return cap ? merged.slice(0, cap) : merged;
};

// Pure planner. Rules, so a restore never surprises anyone:
//  - A record whose id already exists is left alone; existing data wins.
//  - An incoming item with the same source/type/content as an existing one is
//    merged into it (tags and collections are unioned) and its notes follow.
//  - Collections are matched by name (case-insensitive) so names stay unique.
//  - Importing the same file twice therefore changes nothing the second time.
export function planImport(existing: Snapshot, incoming: ExportBundle, mode: ImportMode): ImportPlan {
  const base: Snapshot = mode === "replace" ? { items: [], notes: [], collections: [] } : existing;
  const stats: ImportStats = {
    mode,
    items: { added: 0, merged: 0, skipped: 0 },
    collections: { added: 0, merged: 0, skipped: 0 },
    notes: { added: 0, skipped: 0 },
    deleted:
      mode === "replace"
        ? { items: existing.items.length, notes: existing.notes.length, collections: existing.collections.length }
        : { items: 0, notes: 0, collections: 0 },
  };

  const collectionsById = new Map(base.collections.map((c) => [c.id, c]));
  const collectionByName = new Map(base.collections.map((c) => [c.name.toLowerCase(), c.id]));
  const collectionMap = new Map<string, string>();
  const collectionWrites: Collection[] = [];

  for (const c of incoming.collections) {
    if (collectionsById.has(c.id)) {
      collectionMap.set(c.id, c.id);
      stats.collections.skipped++;
      continue;
    }
    const sameName = collectionByName.get(c.name.toLowerCase());
    if (sameName) {
      collectionMap.set(c.id, sameName);
      stats.collections.merged++;
      continue;
    }
    collectionsById.set(c.id, c);
    collectionByName.set(c.name.toLowerCase(), c.id);
    collectionMap.set(c.id, c.id);
    collectionWrites.push(c);
    stats.collections.added++;
  }

  const itemsById = new Map(base.items.map((i) => [i.id, i]));
  const itemsByKey = new Map(base.items.map((i) => [itemKey(i), i]));
  const itemMap = new Map<string, string>();
  const itemWrites = new Map<string, Item>();

  for (const item of incoming.items) {
    const mappedCollections = union([], item.collectionIds.map((id) => collectionMap.get(id)).filter((id): id is string => !!id));

    if (itemsById.has(item.id)) {
      itemMap.set(item.id, item.id);
      stats.items.skipped++;
      continue;
    }

    const twin = itemsByKey.get(itemKey(item));
    if (twin) {
      const merged: Item = {
        ...twin,
        tags: union(twin.tags, item.tags, MAX_TAGS_PER_ITEM),
        collectionIds: union(twin.collectionIds, mappedCollections),
      };
      const changed = merged.tags.length !== twin.tags.length || merged.collectionIds.length !== twin.collectionIds.length;
      itemMap.set(item.id, twin.id);
      if (changed) {
        itemsById.set(twin.id, merged);
        itemsByKey.set(itemKey(merged), merged);
        itemWrites.set(twin.id, merged);
        stats.items.merged++;
      } else {
        stats.items.skipped++;
      }
      continue;
    }

    const added = { ...item, collectionIds: mappedCollections };
    itemsById.set(added.id, added);
    itemsByKey.set(itemKey(added), added);
    itemMap.set(item.id, added.id);
    itemWrites.set(added.id, added);
    stats.items.added++;
  }

  const noteIds = new Set(base.notes.map((n) => n.id));
  const noteBodies = new Set(base.notes.map((n) => `${n.target.kind}:${n.target.id}:${n.body}`));
  const noteWrites: Note[] = [];
  for (const note of incoming.notes) {
    const targetId = (note.target.kind === "item" ? itemMap : collectionMap).get(note.target.id);
    const duplicate = targetId !== undefined && noteBodies.has(`${note.target.kind}:${targetId}:${note.body}`);
    if (!targetId || noteIds.has(note.id) || duplicate) {
      stats.notes.skipped++;
      continue;
    }
    noteIds.add(note.id);
    noteBodies.add(`${note.target.kind}:${targetId}:${note.body}`);
    noteWrites.push({ ...note, target: { kind: note.target.kind, id: targetId } });
    stats.notes.added++;
  }

  return { write: { items: [...itemWrites.values()], notes: noteWrites, collections: collectionWrites }, stats };
}
