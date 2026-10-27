import { describe, expect, it } from "vitest";
import { SearchIndex, highlight } from "../src/search";
import { parseQuery } from "../src/search/query";
import { tokenize } from "../src/search/tokenize";
import type { Item, Note } from "../src/shared/types";

let n = 0;
const item = (over: Partial<Item> & { title?: string } = {}): Item => {
  const { title, ...rest } = over;
  n++;
  return {
    id: `i${n}`, type: "excerpt", content: "", capturedAt: `2026-10-0${(n % 9) + 1}T00:00:00.000Z`,
    source: { url: `https://example.com/p${n}`, pageTitle: title ?? `Page ${n}` }, tags: [], collectionIds: [], ...rest,
  };
};
const note = (itemId: string, body: string): Note => ({ id: `n-${itemId}-${body}`, target: { kind: "item", id: itemId }, body, createdAt: "t", updatedAt: "t" });
const ids = (index: SearchIndex, q: string, opts = {}) => index.search(q, opts).map((r) => r.item.id);

describe("tokenize", () => {
  it("splits identifiers, folds accents, and handles URLs", () => {
    expect(tokenize("getUserById")).toEqual(["getuserbyid", "get", "user", "by", "id"]);
    expect(tokenize("HTTPServer")).toEqual(["httpserver", "http", "server"]);
    expect(tokenize("Café")).toEqual(["cafe"]);
    expect(tokenize("example.com/docs?x=1")).toEqual(["example", "com", "docs", "x", "1"]);
    expect(tokenize("")).toEqual([]);
  });

  it("drops absurdly long tokens", () => {
    expect(tokenize("a".repeat(500))).toEqual([]);
  });
});

describe("parseQuery", () => {
  it("separates terms, phrases and filters", () => {
    const q = parseQuery('read "row level" tag:SQL type:Code site:Example.com tr');
    expect(q.terms.map((t) => t.text)).toEqual(["read", "row", "level", "tr"]);
    expect(q.phrases).toEqual(["row level"]);
    expect(q.tags).toEqual(["sql"]);
    expect(q.types).toEqual(["code"]);
    expect(q.sites).toEqual(["example.com"]);
  });

  it("treats only the last bare term as a prefix", () => {
    const terms = parseQuery("read trans").terms;
    expect(terms.map((t) => t.prefix)).toEqual([false, true]);
  });

  it("survives hostile and malformed input", () => {
    for (const q of ['"unterminated', "(*[\\", "tag:", "type:", "   ", '""', "a".repeat(10_000)]) {
      expect(() => parseQuery(q)).not.toThrow();
    }
  });
});

describe("SearchIndex", () => {
  it("ranks title above content, and tags above content", () => {
    const body = item({ title: "Unrelated", content: "mvcc explained" });
    const title = item({ title: "MVCC guide" });
    const tagged = item({ title: "Other", tags: ["mvcc"] });
    expect(ids(SearchIndex.build([body, title, tagged], []), "mvcc")).toEqual([title.id, tagged.id, body.id]);
  });

  it("requires every term (AND) across fields, including notes and URLs", () => {
    const a = item({ title: "Alpha", content: "postgres" });
    const b = item({ title: "Beta", content: "postgres", source: { url: "https://pg.example.org/docs", pageTitle: "Beta" } });
    const index = SearchIndex.build([a, b], [note(a.id, "vacuum tuning")]);
    expect(ids(index, "postgres vacuum")).toEqual([a.id]);
    expect(ids(index, "postgres docs")).toEqual([b.id]);
    expect(ids(index, "postgres nonsense")).toEqual([]);
  });

  it("matches prefixes on the last term only", () => {
    const a = item({ content: "transactions isolate" });
    const index = SearchIndex.build([a], []);
    expect(ids(index, "trans")).toEqual([a.id]);
    expect(ids(index, "transactions isolat")).toEqual([a.id]);
    expect(ids(index, "trans isolate")).toEqual([]);
    expect(ids(index, "isolat transactions")).toEqual([]);
    expect(ids(index, "transactions isolate x")).toEqual([]);
  });

  it("folds accents and case", () => {
    const a = item({ title: "Café Culture" });
    expect(ids(SearchIndex.build([a], []), "CAFE")).toEqual([a.id]);
  });

  it("supports exact phrases", () => {
    const a = item({ content: "read committed is the default" });
    const b = item({ content: "committed read of rows" });
    const index = SearchIndex.build([a, b], []);
    expect(ids(index, '"read committed"')).toEqual([a.id]);
    expect(ids(index, "read committed").sort()).toEqual([a.id, b.id].sort());
  });

  it("applies tag, type, site and collection filters", () => {
    const a = item({ type: "code", tags: ["sql"], collectionIds: ["c1"], content: "select" });
    const b = item({ type: "excerpt", tags: ["sql", "db"], source: { url: "https://docs.postgresql.org/x", pageTitle: "B" }, content: "select" });
    const index = SearchIndex.build([a, b], []);
    expect(ids(index, "tag:sql select").sort()).toEqual([a.id, b.id].sort());
    expect(ids(index, "tag:db")).toEqual([b.id]);
    expect(ids(index, "type:code")).toEqual([a.id]);
    expect(ids(index, "site:postgresql.org")).toEqual([b.id]);
    expect(ids(index, "site:gresql.org")).toEqual([]);
    expect(ids(index, "select", { collectionId: "c1" })).toEqual([a.id]);
    expect(ids(index, "tag:missing")).toEqual([]);
    expect(ids(index, "tag:!!!")).toEqual([]);
  });

  it("lists everything newest-first for an empty query, and respects limit", () => {
    const items = [item(), item(), item()];
    const index = SearchIndex.build(items, []);
    const order = ids(index, "");
    expect(order).toHaveLength(3);
    const dates = index.search("").map((r) => r.item.capturedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(index.search("", { limit: 2 })).toHaveLength(2);
  });

  it("is deterministic when scores tie", () => {
    const items = [item({ content: "same" }), item({ content: "same" }), item({ content: "same" })];
    const index = SearchIndex.build(items, []);
    expect(ids(index, "same")).toEqual(ids(index, "same"));
  });

  it("finds code by identifier parts and language", () => {
    const code = item({ type: "code", language: "typescript", content: "const userId = getUserById(id);" });
    const index = SearchIndex.build([code], []);
    expect(ids(index, "user")).toEqual([code.id]);
    expect(ids(index, "typescript")).toEqual([code.id]);
  });

  it("handles an empty index", () => {
    expect(SearchIndex.build([], []).search("anything")).toEqual([]);
  });

  it("reports which fields matched", () => {
    const a = item({ title: "Locks", tags: ["locks"] });
    const [hit] = SearchIndex.build([a], []).search("locks");
    expect([...hit!.matched].sort()).toEqual(["tags", "title"]);
  });
});

describe("highlight", () => {
  it("marks matching words using original offsets", () => {
    const segments = highlight("The Café serves Transactions daily", "cafe trans");
    expect(segments.filter((s) => s.hit).map((s) => s.text)).toEqual(["Café", "Transactions"]);
    expect(segments.map((s) => s.text).join("")).toBe("The Café serves Transactions daily");
  });

  it("returns the text untouched without terms", () => {
    expect(highlight("abc", "tag:x")).toEqual([{ text: "abc", hit: false }]);
  });
});
