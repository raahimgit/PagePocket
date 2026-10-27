import { describe, expect, it } from "vitest";
import { extractPage } from "../src/extraction";
import {
  BASE_HREF, BLOG, DIV_SOUP, DOCUSAURUS, GITHUB, HOSTILE, MDN, SHADOW_AND_IFRAME, SPA_RENDERED, SPA_SHELL, SPHINX, hugePage,
  type PageFixture,
} from "./fixtures/pages";
import { dom, select } from "./helpers";

const load = (fixture: PageFixture) => dom(fixture.html, fixture.url);

describe("GitHub README", () => {
  it("scopes to the README, resolves heading anchors from sibling permalinks, and keeps shell code", () => {
    const doc = load(GITHUB);
    select(doc, doc.getElementById("intro")!);
    const page = extractPage(doc);

    expect(page.source.pageTitle).toContain("postgres/postgres");
    expect(page.metadata).toMatchObject({ siteName: "GitHub", canonicalUrl: "https://github.com/postgres/postgres" });
    expect(page.headings.map((h) => h.text)).toEqual(["PostgreSQL Database Management System", "Building"]);
    expect(page.headings[1]?.url).toBe("https://github.com/postgres/postgres#building");
    expect(page.links).toEqual([{ url: "https://www.postgresql.org/docs/devel/", text: "the documentation" }]);
    expect(page.codeBlocks).toEqual([
      { content: "./configure\nmake\nsu\nmake install", language: "shell", headingContext: "Building" },
    ]);
    expect(page.selection).toMatchObject({ headingContext: "PostgreSQL Database Management System" });
    expect(page.warnings).toEqual([]);
  });
});

describe("MDN", () => {
  it("handles brush-style code classes, nested permalinks and relative links", () => {
    const page = extractPage(load(MDN));
    expect(page.headings.map((h) => [h.level, h.text, h.id])).toEqual([
      [1, "Array.prototype.map()", undefined],
      [2, "Syntax", "syntax"],
      [2, "Examples", "examples"],
      [3, "Mapping an array", "mapping_an_array"],
    ]);
    expect(page.codeBlocks.map((b) => [b.language, b.headingContext])).toEqual([["javascript", "Syntax"], ["javascript", "Mapping an array"]]);
    expect(page.codeBlocks[0]?.content).toBe("map(callbackFn)\nmap(callbackFn, thisArg)");
    expect(page.codeBlocks[1]?.content).toBe("const roots = numbers.map((num) => Math.sqrt(num));");
    expect(page.links).toEqual([
      { url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach", text: "forEach" },
    ]);
  });
});

describe("Sphinx", () => {
  it("finds role=main, strips permalink glyphs, and reads the language from the wrapper", () => {
    const doc = load(SPHINX);
    select(doc, doc.getElementById("usage")!);
    const page = extractPage(doc);

    expect(page.headings.map((h) => h.text)).toEqual(["json — JSON encoder and decoder", "Basic Usage"]);
    expect(page.headings[0]?.url).toBe("https://docs.python.org/3/library/json.html#module-json");
    expect(page.codeBlocks).toHaveLength(1);
    expect(page.codeBlocks[0]?.language).toBe("python");
    expect(page.codeBlocks[0]?.content.startsWith(">>> import json")).toBe(true);
    expect(page.links.map((l) => l.text)).toEqual(["RFC 7159"]);
    expect(page.selection?.headingContext).toBe("Basic Usage");
  });
});

describe("Docusaurus", () => {
  it("removes the zero-width permalink text from headings", () => {
    const page = extractPage(load(DOCUSAURUS));
    expect(page.headings.map((h) => h.text)).toEqual(["Getting Started", "Install"]);
    expect(page.headings[1]?.url).toBe("https://foo.dev/docs/getting-started#install");
  });

  it("keeps line breaks that are <br> elements inside code", () => {
    const page = extractPage(load(DOCUSAURUS));
    expect(page.codeBlocks).toEqual([{ content: "npm install foo\nnpm run build", language: "shell", headingContext: "Install" }]);
  });

  it("limits links to the article and reports selection context", () => {
    const doc = load(DOCUSAURUS);
    select(doc, doc.getElementById("lead")!);
    const page = extractPage(doc);
    expect(page.links).toEqual([{ url: "https://foo.dev/docs/package-managers", text: "package manager" }]);
    expect(page.selection?.headingContext).toBe("Getting Started");
  });
});

describe("blog post", () => {
  it("prefers explicit meta over JSON-LD, normalizes links, and excludes aside, nav and footer", () => {
    const page = extractPage(load(BLOG));
    expect(page.source.url).toBe("https://blog.example.com/posts/why-mvcc?utm_source=feed");
    expect(page.metadata).toMatchObject({
      canonicalUrl: "https://blog.example.com/posts/why-mvcc",
      author: "Grace Hopper",
      publishedAt: "2026-03-02T09:00:00Z",
      siteName: "Example Blog",
      description: "A tour of multi-version concurrency control.",
    });
    expect(page.links).toEqual([{ url: "https://www.postgresql.org/docs/current/mvcc.html", text: "Postgres docs" }]);
    expect(page.headings.map((h) => h.text)).toEqual(["Why MVCC Matters", "Snapshots"]);
  });
});

describe("edge cases", () => {
  it("resolves links against <base href>", () => {
    const page = extractPage(load(BASE_HREF));
    expect(page.links).toEqual([
      { url: "https://cdn.example.org/docs/v2/guide/intro.html", text: "Intro" },
      { url: "https://cdn.example.org/root.html", text: "Root" },
    ]);
  });

  it("captures what is rendered at the moment of extraction (client-rendered pages)", () => {
    const doc = load(SPA_SHELL);
    const before = extractPage(doc);
    expect(before.headings).toEqual([]);
    expect(before.codeBlocks).toEqual([]);
    expect(before.warnings).toEqual([]);

    doc.getElementById("root")!.innerHTML = SPA_RENDERED;
    const after = extractPage(doc);
    expect(after.headings.map((h) => h.text)).toEqual(["Quarterly report"]);
    expect(after.codeBlocks).toMatchObject([{ language: "typescript", content: "const total: number = 1;" }]);
    expect(after.links).toEqual([{ url: "https://example.com/data", text: "Source data" }]);
  });

  it("does not reach into shadow roots (known limitation) and does not fail", () => {
    const doc = load(SHADOW_AND_IFRAME);
    const root = doc.getElementById("host")!.attachShadow({ mode: "open" });
    root.innerHTML = "<pre>shadow code</pre>";
    const page = extractPage(doc);
    expect(page.codeBlocks.map((b) => b.content)).toEqual(["light code"]);
    expect(page.warnings).toEqual([]);
  });

  it("degrades to title and URL on pages with no semantic structure", () => {
    const page = extractPage(load(DIV_SOUP));
    expect(page.source).toEqual({ url: "https://example.com/soup", pageTitle: "Soup", canonicalUrl: undefined });
    expect(page.headings).toEqual([]);
    expect(page.links).toEqual([]);
    expect(page.codeBlocks).toEqual([]);
    expect(page.warnings).toEqual([]);
  });

  it("treats hostile markup as data", () => {
    const page = extractPage(load(HOSTILE));
    expect(page.links).toEqual([{ url: "https://ok.example.org/x", text: "fine" }]);
    expect(page.codeBlocks[0]?.content).toBe("alert(1)text");
    expect(page.codeBlocks[1]).toMatchObject({ truncated: true });
    expect(page.codeBlocks[1]?.content).toHaveLength(50_000);
  });

  it("caps output on very large pages", () => {
    const page = extractPage(load(hugePage()));
    expect(page.headings).toHaveLength(200);
    expect(page.links).toHaveLength(100);
    expect(page.codeBlocks).toHaveLength(100);
  });
});
