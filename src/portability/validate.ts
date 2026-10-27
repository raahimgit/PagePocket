import { normalizeTag, MAX_TAGS_PER_ITEM } from "../library/tags";
import { SCHEMA_VERSION, type Collection, type ExportBundle, type Item, type ItemType, type Note } from "../shared/types";

export const LIMITS = {
  fileChars: 50_000_000,
  items: 100_000,
  notes: 200_000,
  collections: 5_000,
  content: 200_000,
  title: 1_000,
  url: 4_096,
  note: 10_000,
  name: 100,
  description: 2_000,
  id: 100,
  short: 100,
  collectionsPerItem: 100,
  errors: 50,
} as const;

export type ParseResult =
  | { ok: true; bundle: ExportBundle; warnings: string[] }
  | { ok: false; errors: string[] };

const ITEM_TYPES: readonly ItemType[] = ["page", "excerpt", "code", "heading", "link", "screenshot"];
const ID = /^[A-Za-z0-9_-]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T/;
const SOURCE_PROTOCOLS = new Set(["http:", "https:", "file:"]);
const LINK_PROTOCOLS = new Set(["http:", "https:"]);

// Migrations run in order from the file's version up to SCHEMA_VERSION.
// Empty while the format is at version 1.
const MIGRATIONS: Record<number, (bundle: Record<string, unknown>) => Record<string, unknown>> = {};

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

class Problems {
  errors: string[] = [];
  warnings: string[] = [];
  add(path: string, message: string): void {
    if (this.errors.length < LIMITS.errors) this.errors.push(`${path}: ${message}`);
  }
}

function text(p: Problems, obj: Rec, key: string, path: string, max: number, opts: { optional?: boolean; allowEmpty?: boolean } = {}): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    if (!opts.optional) p.add(`${path}.${key}`, "is required");
    return undefined;
  }
  if (typeof value !== "string") {
    p.add(`${path}.${key}`, "must be a string");
    return undefined;
  }
  if (value.length > max) {
    p.add(`${path}.${key}`, `is longer than ${max} characters`);
    return undefined;
  }
  if (!opts.allowEmpty && !opts.optional && value.trim() === "") {
    p.add(`${path}.${key}`, "must not be empty");
    return undefined;
  }
  return value;
}

function id(p: Problems, obj: Rec, key: string, path: string): string | undefined {
  const value = text(p, obj, key, path, LIMITS.id);
  if (value !== undefined && !ID.test(value)) {
    p.add(`${path}.${key}`, "may only contain letters, digits, - and _");
    return undefined;
  }
  return value;
}

function date(p: Problems, obj: Rec, key: string, path: string): string | undefined {
  const value = obj[key];
  if (typeof value !== "string" || !ISO.test(value) || Number.isNaN(Date.parse(value))) {
    p.add(`${path}.${key}`, "must be an ISO 8601 date-time");
    return undefined;
  }
  return new Date(value).toISOString();
}

function url(p: Problems, obj: Rec, key: string, path: string, protocols: Set<string>, optional: boolean): string | undefined {
  const value = text(p, obj, key, path, LIMITS.url, { optional });
  if (value === undefined) return undefined;
  try {
    if (!protocols.has(new URL(value).protocol)) throw new Error("scheme");
  } catch {
    p.add(`${path}.${key}`, `is not an acceptable URL (${[...protocols].join(" ")} only)`);
    return undefined;
  }
  return value;
}

function parseItem(p: Problems, raw: unknown, path: string): Item | undefined {
  if (!isRecord(raw)) return void p.add(path, "must be an object");
  const before = p.errors.length;

  const itemId = id(p, raw, "id", path);
  const type = raw.type;
  if (!ITEM_TYPES.includes(type as ItemType)) p.add(`${path}.type`, `must be one of ${ITEM_TYPES.join(", ")}`);
  const content = text(p, raw, "content", path, LIMITS.content, { allowEmpty: true });
  const capturedAt = date(p, raw, "capturedAt", path);

  let source: Item["source"] | undefined;
  if (!isRecord(raw.source)) p.add(`${path}.source`, "is required: every item must identify its source");
  else {
    const sp = `${path}.source`;
    const sourceUrl = url(p, raw.source, "url", sp, SOURCE_PROTOCOLS, false);
    const pageTitle = text(p, raw.source, "pageTitle", sp, LIMITS.title, { allowEmpty: true });
    const canonicalUrl = url(p, raw.source, "canonicalUrl", sp, LINK_PROTOCOLS, true);
    if (sourceUrl !== undefined && pageTitle !== undefined) {
      source = { url: sourceUrl, pageTitle, ...(canonicalUrl ? { canonicalUrl } : {}) };
    }
  }

  const tags: string[] = [];
  if (!Array.isArray(raw.tags)) p.add(`${path}.tags`, "must be an array");
  else {
    if (raw.tags.length > MAX_TAGS_PER_ITEM) p.add(`${path}.tags`, `has more than ${MAX_TAGS_PER_ITEM} entries`);
    raw.tags.slice(0, MAX_TAGS_PER_ITEM).forEach((tag, i) => {
      const clean = typeof tag === "string" ? normalizeTag(tag) : null;
      if (clean === null) p.add(`${path}.tags[${i}]`, "is not a valid tag");
      else if (!tags.includes(clean)) tags.push(clean);
    });
  }

  const collectionIds: string[] = [];
  if (!Array.isArray(raw.collectionIds)) p.add(`${path}.collectionIds`, "must be an array");
  else if (raw.collectionIds.length > LIMITS.collectionsPerItem) p.add(`${path}.collectionIds`, "has too many entries");
  else {
    raw.collectionIds.forEach((cid, i) => {
      if (typeof cid !== "string" || !ID.test(cid) || cid.length > LIMITS.id) p.add(`${path}.collectionIds[${i}]`, "is not a valid id");
      else if (!collectionIds.includes(cid)) collectionIds.push(cid);
    });
  }

  const language = text(p, raw, "language", path, LIMITS.short, { optional: true });
  const headingContext = text(p, raw, "headingContext", path, LIMITS.title, { optional: true });
  const targetUrl = url(p, raw, "targetUrl", path, LINK_PROTOCOLS, true);

  if (p.errors.length > before || !itemId || !source || capturedAt === undefined || content === undefined) return undefined;
  return {
    id: itemId, type: type as ItemType, source, content, capturedAt, tags, collectionIds,
    ...(language ? { language } : {}),
    ...(headingContext ? { headingContext } : {}),
    ...(targetUrl ? { targetUrl } : {}),
  };
}

function parseNote(p: Problems, raw: unknown, path: string): Note | undefined {
  if (!isRecord(raw)) return void p.add(path, "must be an object");
  const before = p.errors.length;
  const noteId = id(p, raw, "id", path);
  const body = text(p, raw, "body", path, LIMITS.note);
  const createdAt = date(p, raw, "createdAt", path);
  const updatedAt = date(p, raw, "updatedAt", path);

  let target: Note["target"] | undefined;
  if (!isRecord(raw.target)) p.add(`${path}.target`, "is required");
  else {
    const kind = raw.target.kind;
    const targetId = id(p, raw.target, "id", `${path}.target`);
    if (kind !== "item" && kind !== "collection") p.add(`${path}.target.kind`, 'must be "item" or "collection"');
    else if (targetId) target = { kind, id: targetId };
  }

  if (p.errors.length > before || !noteId || !target || body === undefined || !createdAt || !updatedAt) return undefined;
  return { id: noteId, target, body: body.trim(), createdAt, updatedAt };
}

function parseCollection(p: Problems, raw: unknown, path: string): Collection | undefined {
  if (!isRecord(raw)) return void p.add(path, "must be an object");
  const before = p.errors.length;
  const cid = id(p, raw, "id", path);
  const name = text(p, raw, "name", path, LIMITS.name);
  const description = text(p, raw, "description", path, LIMITS.description, { optional: true });
  const createdAt = date(p, raw, "createdAt", path);
  const updatedAt = date(p, raw, "updatedAt", path);
  if (p.errors.length > before || !cid || name === undefined || !createdAt || !updatedAt) return undefined;
  return { id: cid, name: name.trim().replace(/\s+/g, " "), ...(description?.trim() ? { description: description.trim() } : {}), createdAt, updatedAt };
}

function list<T>(p: Problems, raw: unknown, key: string, max: number, parse: (p: Problems, v: unknown, path: string) => T | undefined, idOf: (v: T) => string): T[] {
  if (!Array.isArray(raw)) {
    p.add(key, "must be an array");
    return [];
  }
  if (raw.length > max) {
    p.add(key, `has more than ${max} entries`);
    return [];
  }
  const seen = new Set<string>();
  const out: T[] = [];
  raw.forEach((entry, i) => {
    const parsed = parse(p, entry, `${key}[${i}]`);
    if (!parsed) return;
    const key2 = idOf(parsed);
    if (seen.has(key2)) p.add(`${key}[${i}].id`, `duplicates another entry ("${key2}")`);
    else {
      seen.add(key2);
      out.push(parsed);
    }
  });
  return out;
}

export function parseBundle(input: string): ParseResult {
  if (input.length > LIMITS.fileChars) return { ok: false, errors: ["File is too large to import."] };
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return { ok: false, errors: ["File is not valid JSON."] };
  }
  return validateBundle(raw);
}

export function validateBundle(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, errors: ["Top level must be a JSON object."] };

  let version = raw.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: ["schemaVersion is missing or invalid. This does not look like a ContextLens export."] };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, errors: [`This file uses format version ${version}; this build understands up to ${SCHEMA_VERSION}. Update ContextLens to import it.`] };
  }
  let data: Rec = raw;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, errors: [`No migration from format version ${version}.`] };
    data = migrate(data);
    version++;
  }

  const p = new Problems();
  const collections = list(p, data.collections, "collections", LIMITS.collections, parseCollection, (c) => c.id);
  const items = list(p, data.items, "items", LIMITS.items, parseItem, (i) => i.id);
  const notes = list(p, data.notes, "notes", LIMITS.notes, parseNote, (n) => n.id);
  const exportedAt = typeof data.exportedAt === "string" && !Number.isNaN(Date.parse(data.exportedAt))
    ? new Date(data.exportedAt).toISOString()
    : new Date(0).toISOString();

  if (p.errors.length) {
    if (p.errors.length >= LIMITS.errors) p.errors.push("More problems were found but are not listed.");
    return { ok: false, errors: p.errors };
  }

  const collectionIds = new Set(collections.map((c) => c.id));
  const itemIds = new Set(items.map((i) => i.id));
  let danglingRefs = 0;
  const cleanItems = items.map((item) => {
    const kept = item.collectionIds.filter((id) => collectionIds.has(id));
    danglingRefs += item.collectionIds.length - kept.length;
    return kept.length === item.collectionIds.length ? item : { ...item, collectionIds: kept };
  });
  const cleanNotes = notes.filter((n) => (n.target.kind === "item" ? itemIds : collectionIds).has(n.target.id));

  if (danglingRefs) p.warnings.push(`${danglingRefs} reference(s) to missing collections were dropped.`);
  if (cleanNotes.length < notes.length) p.warnings.push(`${notes.length - cleanNotes.length} note(s) attached to missing items or collections were dropped.`);

  return { ok: true, bundle: { schemaVersion: SCHEMA_VERSION, exportedAt, items: cleanItems, notes: cleanNotes, collections }, warnings: p.warnings };
}
