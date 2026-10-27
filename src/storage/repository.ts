import type { Collection, Item, Note, NoteTarget } from "../shared/types";

// Persistence boundary. Implementations must give these cascade guarantees
// atomically:
//   deleteItem        also deletes notes attached to that item.
//   deleteCollection  also deletes its notes and removes the id from every
//                     item's collectionIds. Items themselves are kept.
// Reads return copies; mutating a returned object never changes stored data.
// applyBundle is all-or-nothing: on any failure nothing is written, and in
// "replace" mode nothing is deleted either.
export interface BundleData {
  items: Item[];
  notes: Note[];
  collections: Collection[];
}

export interface Repository {
  putItem(item: Item): Promise<void>;
  getItem(id: string): Promise<Item | undefined>;
  deleteItem(id: string): Promise<void>;
  listItems(): Promise<Item[]>;

  putNote(note: Note): Promise<void>;
  getNote(id: string): Promise<Note | undefined>;
  deleteNote(id: string): Promise<void>;
  listNotes(): Promise<Note[]>;
  listNotesForTarget(target: NoteTarget): Promise<Note[]>;

  putCollection(collection: Collection): Promise<void>;
  getCollection(id: string): Promise<Collection | undefined>;
  deleteCollection(id: string): Promise<void>;
  listCollections(): Promise<Collection[]>;

  applyBundle(data: BundleData, mode: "merge" | "replace"): Promise<void>;
}
