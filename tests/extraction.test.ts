import { describe, expect, it } from "vitest";
import { extractPage } from "../src/extraction";
import { detectLanguage } from "../src/extraction/code";
import { dom, select } from "./helpers";

const ARTICLE = `<!doctype html><html lang="en"><head>
<title> Transactions </title>
<link rel="canonical" href="/docs/transactions?utm_medium=x">
<meta name="description" content="About   transactions">
<meta property="og:site_name" content="PG Docs">
<script type="application/ld+json">{"@graph":[{"datePublished":"2026-01-02","author":{"name":"Ada"}}]}</script>
</head><body>
<nav><h2>Menu</h2><a href="/nav">Nav link</a></nav>
<main>
  <h1 id="top">Transactions <a class="headerlink" href="#top">¶</a></h1>
  <p id="intro">Intro text.</p>
  <h2 id="isolation">Isolation</h2>
  <p id="body">Read committed is the default.</p>
  <pre><code class="language-sql">BEGIN;\nSELECT 1;\n</code></pre>
  <a href="https://github.com/postgres/postgres?utm_source=a">Repo</a>
  <a href="#top">Self</a>
  <a href="mailto:x@y.z">Mail</a>
</main></body></html>`;

describe("extractPage", () => {
  it("extracts metadata, headings, links and code with context", () => {
    const doc = dom(ARTICLE, "https://example.com/docs/transactions");
    const page = extractPage(doc);

    expect(page.source.pageTitle).toBe("Transactions");
    expect(page.source.url).toBe("https://example.com/docs/transactions");
    expect(page.metadata.canonicalUrl).toBe("https://example.com/docs/transactions");
    expect(page.metadata).toMatchObject({
      description: "About transactions",
      siteName: "PG Docs",
      author: "Ada",
      publishedAt: "2026-01-02",
      language: "en",
    });

    expect(page.headings.map((h) => h.text)).toEqual(["Transactions", "Isolation"]);
    expect(page.headings[1]?.url).toBe("https://example.com/docs/transactions#isolation");
    expect(page.links).toEqual([{ url: "https://github.com/postgres/postgres", text: "Repo" }]);
    expect(page.codeBlocks).toEqual([
      { content: "BEGIN;\nSELECT 1;", language: "sql", headingContext: "Isolation" },
    ]);
    expect(page.selection).toBeNull();
    expect(page.warnings).toEqual([]);
  });

  it("captures a selection with its nearest heading", () => {
    const doc = dom(ARTICLE);
    select(doc, doc.getElementById("body")!);
    expect(extractPage(doc).selection).toEqual({
      text: "Read committed is the default.",
      headingContext: "Isolation",
    });
  });

  it("omits heading context when none precedes the selection", () => {
    const doc = dom("<body><p id='p'>hello</p><h2>After</h2></body>");
    select(doc, doc.getElementById("p")!);
    expect(extractPage(doc).selection).toEqual({ text: "hello", headingContext: undefined });
  });

  it("reads selections inside text areas", () => {
    const doc = dom("<body><textarea id='t'>abcdef</textarea></body>");
    const area = doc.getElementById("t") as HTMLTextAreaElement;
    area.focus();
    area.setSelectionRange(1, 4);
    expect(extractPage(doc).selection?.text).toBe("bcd");
  });

  it("degrades on empty and malformed documents", () => {
    const page = extractPage(dom("<<<not html", "about:blank"));
    expect(page.headings).toEqual([]);
    expect(page.codeBlocks).toEqual([]);
    expect(page.selection).toBeNull();
  });

  it("ignores broken JSON-LD", () => {
    const doc = dom('<head><script type="application/ld+json">{oops</script></head><body></body>');
    expect(extractPage(doc).metadata.author).toBeUndefined();
  });

  it("scopes GitHub to the README when there is exactly one", () => {
    const doc = dom(
      `<body><main><a href="/other">Chrome link</a><article class="markdown-body"><h1>Readme</h1><a href="https://example.org/x">Docs</a></article></main></body>`,
      "https://github.com/owner/repo",
    );
    expect(extractPage(doc).links).toEqual([{ url: "https://example.org/x", text: "Docs" }]);
  });
});

describe("detectLanguage", () => {
  const pre = (html: string) => dom(`<body>${html}</body>`).querySelector("pre")!;

  it.each([
    ['<pre><code class="language-py">x</code></pre>', "python"],
    ['<pre class="lang-ts">x</pre>', "typescript"],
    ['<div class="highlight-source-js"><pre>x</pre></div>', "javascript"],
    ['<div class="highlight-default notranslate"><pre>x</pre></div>', undefined],
    ['<pre data-lang="Go">x</pre>', "go"],
    ["<pre>x</pre>", undefined],
  ])("%s", (html, expected) => expect(detectLanguage(pre(html))).toBe(expected));
});

describe("code blocks", () => {
  it("strips line-number gutters and skips empty blocks", () => {
    const doc = dom(
      `<body><pre><code><span class="lineno">1</span>a\n<span class="lineno">2</span>b</code></pre><pre>  </pre></body>`,
    );
    expect(extractPage(doc).codeBlocks.map((b) => b.content)).toEqual(["a\nb"]);
  });

  it("flags truncated blocks instead of silently cutting them", () => {
    const doc = dom(`<body><pre>${"x".repeat(60_000)}</pre></body>`);
    const [block] = extractPage(doc).codeBlocks;
    expect(block?.content).toHaveLength(50_000);
    expect(block?.truncated).toBe(true);
  });
});
