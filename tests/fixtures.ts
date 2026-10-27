import type { Collection, Item, Note } from "../src/shared/types";

export const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, type: "excerpt", content: `content ${id}`, capturedAt: "2026-10-05T10:00:00.000Z",
  source: { url: `https://example.com/${id}`, pageTitle: `Page ${id}` }, tags: [], collectionIds: [], ...over,
});

export const collection = (id: string, name = id): Collection => ({
  id, name, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
});

export const note = (id: string, target: Note["target"], body = "a note"): Note => ({
  id, target, body, createdAt: "2026-10-05T11:00:00.000Z", updatedAt: "2026-10-05T11:00:00.000Z",
});
