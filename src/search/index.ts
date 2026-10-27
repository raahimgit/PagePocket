import type { Item, Note } from "../shared/types";
import { collapsePhrase, parseQuery, type QueryTerm } from "./query";
import { tokenize } from "./tokenize";

export type Field = "title" | "tags" | "notes" | "heading" | "content" | "url";

const WEIGHTS: Record<Field, number> = { title: 5, tags: 4, notes: 2.5, heading: 2, content: 1.5, url: 1 };
const TF_SATURATION = 1.2;
const PREFIX_FACTOR = 0.6;
const MAX_PREFIX_EXPANSIONS = 200;
const DEFAULT_LIMIT = 200;

export interface SearchOptions {
  collectionId?: string;
  limit?: number;
}

export interface SearchResult {
  item: Item;
  score: number;
  matched: Field[];
}

type TermFrequencies = Partial<Record<Field, number>>;

interface Doc {
  item: Item;
  notes: Note[];
  host: string | undefined;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function stripScheme(url: string | undefined): string {
  return url ? url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") : "";
}

function fieldTexts(doc: Doc): Record<Field, string> {
  const { item } = doc;
  return {
    title: item.source.pageTitle,
    tags: item.tags.join(" "),
    notes: doc.notes.map((n) => n.body).join("\n"),
    heading: [item.headingContext, item.language, item.type].filter(Boolean).join(" "),
    content: item.type === "screenshot" ? "" : item.content,
    url: [item.source.url, item.source.canonicalUrl, item.targetUrl].map(stripScheme).join(" "),
  };
}

// Immutable snapshot. Rebuilding is a single pass over all items, which stays
// in the low milliseconds for thousands of items; incremental updates would add
// invalidation bugs for no measurable gain at this scale.
export class SearchIndex {
  private readonly postings = new Map<string, Map<number, TermFrequencies>>();
  private readonly sortedTerms: string[];

  private constructor(private readonly docs: Doc[]) {
    docs.forEach((doc, id) => {
      const texts = fieldTexts(doc);
      for (const field of Object.keys(texts) as Field[]) {
        for (const term of tokenize(texts[field])) {
          let posting = this.postings.get(term);
          if (!posting) this.postings.set(term, (posting = new Map()));
          const tf = posting.get(id) ?? {};
          tf[field] = (tf[field] ?? 0) + 1;
          posting.set(id, tf);
        }
      }
    });
    this.sortedTerms = [...this.postings.keys()].sort();
  }

  static build(items: Item[], notes: Note[]): SearchIndex {
    const notesByItem = new Map<string, Note[]>();
    for (const note of notes) {
      if (note.target.kind !== "item") continue;
      const list = notesByItem.get(note.target.id) ?? [];
      list.push(note);
      notesByItem.set(note.target.id, list);
    }
    return new SearchIndex(
      items.map((item) => ({ item, notes: notesByItem.get(item.id) ?? [], host: hostOf(item.source.url) })),
    );
  }

  get size(): number {
    return this.docs.length;
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const parsed = parseQuery(query);
    const specs: QueryTerm[] = parsed.terms;

    let scores: Map<number, number> | undefined;
    const matched = new Map<number, Set<Field>>();
    for (const spec of specs) {
      const hits = this.scoreTerm(spec);
      if (!scores) {
        scores = new Map([...hits].map(([doc, hit]) => [doc, hit.score]));
        for (const [doc, hit] of hits) matched.set(doc, new Set(hit.fields));
      } else {
        for (const [doc, score] of [...scores]) {
          const hit = hits.get(doc);
          if (!hit) {
            scores.delete(doc);
            matched.delete(doc);
          } else {
            scores.set(doc, score + hit.score);
            for (const field of hit.fields) matched.get(doc)!.add(field);
          }
        }
      }
      if (scores.size === 0) return [];
    }

    const candidates = scores ?? new Map(this.docs.map((_, id) => [id, 0] as const));
    const results: SearchResult[] = [];
    for (const [id, score] of candidates) {
      const doc = this.docs[id]!;
      if (!this.passesFilters(doc, parsed, options)) continue;
      if (parsed.phrases.length && !this.containsPhrases(doc, parsed.phrases)) continue;
      results.push({ item: doc.item, score, matched: [...(matched.get(id) ?? [])] });
    }

    results.sort(
      (a, b) =>
        b.score - a.score ||
        b.item.capturedAt.localeCompare(a.item.capturedAt) ||
        a.item.id.localeCompare(b.item.id),
    );
    return results.slice(0, options.limit ?? DEFAULT_LIMIT);
  }

  private passesFilters(doc: Doc, q: ReturnType<typeof parseQuery>, options: SearchOptions): boolean {
    const { item } = doc;
    if (options.collectionId && !item.collectionIds.includes(options.collectionId)) return false;
    if (q.types.length && !q.types.every((t) => t === item.type)) return false;
    if (q.tags.some((t) => t === null || !item.tags.includes(t))) return false;
    return q.sites.every((site) => doc.host !== undefined && (doc.host === site || doc.host.endsWith(`.${site}`)));
  }

  private containsPhrases(doc: Doc, phrases: string[]): boolean {
    const texts = fieldTexts(doc);
    const haystack = Object.values(texts).map(collapsePhrase);
    return phrases.every((phrase) => haystack.some((text) => text.includes(phrase)));
  }

  private scoreTerm(spec: QueryTerm): Map<number, { score: number; fields: Set<Field> }> {
    const expansions = [{ term: spec.text, factor: 1 }];
    if (spec.prefix) {
      for (const term of this.prefixTerms(spec.text)) {
        if (term !== spec.text) expansions.push({ term, factor: PREFIX_FACTOR });
      }
    }

    const total = this.docs.length;
    const best = new Map<number, { score: number; fields: Set<Field> }>();
    for (const { term, factor } of expansions) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const idf = Math.log(1 + total / posting.size);
      for (const [doc, tf] of posting) {
        let weighted = 0;
        for (const field of Object.keys(tf) as Field[]) {
          const count = tf[field]!;
          weighted += WEIGHTS[field] * (count / (count + TF_SATURATION));
        }
        const score = factor * idf * weighted;
        const entry = best.get(doc);
        if (!entry) best.set(doc, { score, fields: new Set(Object.keys(tf) as Field[]) });
        else {
          entry.score = Math.max(entry.score, score);
          for (const field of Object.keys(tf) as Field[]) entry.fields.add(field);
        }
      }
    }
    return best;
  }

  private prefixTerms(prefix: string): string[] {
    let lo = 0;
    let hi = this.sortedTerms.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sortedTerms[mid]! < prefix) lo = mid + 1;
      else hi = mid;
    }
    const out: string[] = [];
    for (let i = lo; i < this.sortedTerms.length && out.length < MAX_PREFIX_EXPANSIONS; i++) {
      const term = this.sortedTerms[i]!;
      if (!term.startsWith(prefix)) break;
      out.push(term);
    }
    return out;
  }
}

export { highlight, type Segment } from "./highlight";
