import { describe, expect, it } from "vitest";
import { renderMarkdown, slugify } from "../src/portability/markdown";
import { collection, item, note } from "./fixtures";

const render = (over: Partial<Parameters<typeof renderMarkdown>[0]> = {}) =>
  renderMarkdown({ scope: null, collectionNotes: [], items: [], notes: [], exportedAt: "2026-10-06T08:00:00.000Z", ...over });

describe("renderMarkdown", () => {
  it("renders a collection with source, date, tags, notes, excerpts and code", () => {
    const c = collection("c1", "PostgreSQL Research");
    const excerpt = item("a", {
      content: "Read committed is the default.", headingContext: "Isolation", tags: ["postgresql", "transactions"],
      source: { url: "https://www.postgresql.org/docs/tx?utm_source=x", pageTitle: "PostgreSQL Documentation — Transactions" },
    });
    const code = item("b", { type: "code", language: "sql", content: "BEGIN;\nSELECT 1;", source: excerpt.source, capturedAt: "2026-10-05T10:05:00.000Z" });
    const md = render({
      scope: c, items: [code, excerpt],
      notes: [note("n1", { kind: "item", id: "a" }, "check\nthis")],
      collectionNotes: [note("n2", { kind: "collection", id: "c1" }, "scope: MVCC")],
    });

    expect(md.startsWith("# PostgreSQL Research\n")).toBe(true);
    expect(md).toContain("remain the work of their original authors");
    expect(md).toContain("## Collection notes");
    expect(md).toContain("- scope: MVCC");
    expect(md.match(/^## PostgreSQL Documentation/gm)).toHaveLength(1);
    expect(md).toContain("- Source: <https://www.postgresql.org/docs/tx?utm_source=x>");
    expect(md).toContain("> Read committed is the default.");
    expect(md).toContain("Captured: 2026-10-05 · Section: Isolation");
    expect(md).toContain("Tags: `postgresql`, `transactions`");
    expect(md).toContain("- check\n  this");
    expect(md).toContain("```sql\nBEGIN;\nSELECT 1;\n```");
    expect(md.indexOf("### Excerpt")).toBeLessThan(md.indexOf("### Code (sql)"));
  });

  it("lengthens the fence when code contains backticks", () => {
    const md = render({ items: [item("a", { type: "code", content: "echo ````x````" })] });
    expect(md).toContain("`````\necho ````x````\n`````");
  });

  it("drops unsafe language identifiers from the fence", () => {
    const md = render({ items: [item("a", { type: "code", language: "x y\nz", content: "1" })] });
    expect(md).toContain("```\n1\n```");
  });

  it("neutralizes raw HTML and structure in captured text", () => {
    const md = render({ items: [item("a", { content: "<script>alert(1)</script>\n# Not a heading\n- not a list\n```\nfence" })] });
    expect(md).toContain("> \\<script>alert(1)\\</script>");
    expect(md).toContain("> \\# Not a heading");
    expect(md).toContain("> \\- not a list");
    expect(md).toContain("> \\```");
    expect(/(^|[^\\])<script/.test(md)).toBe(false);
  });

  it("escapes titles and never links non-http URLs", () => {
    const md = render({
      items: [
        item("a", { source: { url: "https://example.com/a", pageTitle: "A [x](y) <b>*bold*</b>" } }),
        item("b", { type: "link", content: "evil", targetUrl: "javascript:alert(1)", source: { url: "file:///tmp/x.html", pageTitle: "Local" } }),
      ],
    });
    expect(md).toContain("## A \\[x\\](y) \\<b\\>\\*bold\\*\\</b\\>");
    expect(md).toContain("Target: `javascript:alert(1)`");
    expect(md).toContain("- Source: `file:///tmp/x.html`");
    expect(md).not.toContain("<javascript:");
  });

  it("shows canonical only when it differs, and handles heading and link items", () => {
    const same = item("a", { source: { url: "https://example.com/a#x", pageTitle: "A", canonicalUrl: "https://example.com/a" } });
    const diff = item("b", { source: { url: "https://example.com/b", pageTitle: "B", canonicalUrl: "https://other.org/b" } });
    const heading = item("c", { type: "heading", content: "Isolation", targetUrl: "https://example.com/c#iso", source: { url: "https://example.com/c", pageTitle: "C" } });
    const link = item("d", { type: "link", content: "Repo", targetUrl: "https://github.com/x/y", source: { url: "https://example.com/d", pageTitle: "D" } });
    const md = render({ items: [same, diff, heading, link] });
    expect(md.match(/Canonical:/g)).toHaveLength(1);
    expect(md).toContain("- Canonical: <https://other.org/b>");
    expect(md).toContain("### Heading: Isolation");
    expect(md).toContain("Link: <https://example.com/c#iso>");
    expect(md).toContain("### Link: Repo");
    expect(md).toContain("Target: <https://github.com/x/y>");
  });

  it("is deterministic and orders pages by first capture", () => {
    const late = item("a", { capturedAt: "2026-10-07T00:00:00.000Z", source: { url: "https://example.com/late", pageTitle: "Late" } });
    const early = item("b", { capturedAt: "2026-10-01T00:00:00.000Z", source: { url: "https://example.com/early", pageTitle: "Early" } });
    const md = render({ items: [late, early] });
    expect(md.indexOf("## Early")).toBeLessThan(md.indexOf("## Late"));
    expect(render({ items: [early, late] })).toBe(md);
  });

  it("says so when empty", () => {
    expect(render({ scope: collection("c", "Empty") })).toContain("_No items._");
  });
});

describe("slugify", () => {
  it.each([["PostgreSQL Research", "postgresql-research"], ["  Café / Notes!! ", "cafe-notes"], ["???", "contextlens"], ["", "contextlens"]])(
    "%s",
    (input, expected) => expect(slugify(input)).toBe(expected),
  );
});
