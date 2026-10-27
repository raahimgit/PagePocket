// Hand-written from the markup patterns these sites emit. They are not
// downloaded copies, so they pin down the patterns the extractor claims to
// handle rather than the exact current output of any one site.
export interface PageFixture {
  url: string;
  html: string;
}

const svg = '<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m7.775"></path></svg>';

export const GITHUB: PageFixture = {
  url: "https://github.com/postgres/postgres",
  html: `<!doctype html><html lang="en"><head>
<title>GitHub - postgres/postgres: Mirror of the official PostgreSQL GIT repository</title>
<meta name="description" content="Mirror of the official PostgreSQL GIT repository.">
<meta property="og:site_name" content="GitHub">
<link rel="canonical" href="https://github.com/postgres/postgres"></head><body>
<header class="Header"><nav aria-label="Global"><a href="/features">Features</a><a href="/pricing">Pricing</a></nav></header>
<div id="repo-content-pjax-container"><main id="js-repo-pjax-container"><div class="Layout"><div class="Layout-main">
<div id="readme" class="Box md"><article class="markdown-body entry-content container-lg" itemprop="text">
<div class="markdown-heading" dir="auto"><h1 tabindex="-1" class="heading-element" dir="auto">PostgreSQL Database Management System</h1><a id="user-content-postgresql-database-management-system" class="anchor" aria-label="Permalink: PostgreSQL Database Management System" href="#postgresql-database-management-system">${svg}</a></div>
<p dir="auto" id="intro">This directory contains the source code distribution. See <a href="https://www.postgresql.org/docs/devel/">the documentation</a>.</p>
<div class="markdown-heading" dir="auto"><h2 tabindex="-1" class="heading-element" dir="auto">Building</h2><a id="user-content-building" class="anchor" aria-label="Permalink: Building" href="#building">${svg}</a></div>
<div class="highlight highlight-source-shell notranslate position-relative overflow-auto" dir="auto"><pre>./configure
make
su
make install</pre><div class="zeroclipboard-container"><clipboard-copy aria-label="Copy" class="ClipboardButton btn" value="./configure&#10;make">${svg}</clipboard-copy></div></div>
</article></div></div><aside class="Layout-sidebar"><h2>About</h2><a href="https://example.org/sidebar-link">Website</a></aside></div></main>
<footer><a href="/terms">Terms</a></footer></div></body></html>`,
};

export const MDN: PageFixture = {
  url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map",
  html: `<!doctype html><html lang="en-US"><head><title>Array.prototype.map() - JavaScript | MDN</title>
<link rel="canonical" href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map">
<meta name="description" content="The map() method of Array instances creates a new array."><meta property="og:site_name" content="MDN Web Docs"></head><body>
<header class="top-navigation"><nav><a href="/en-US/docs/Web">Technologies</a></nav></header>
<div class="page-layout"><aside class="sidebar"><nav class="sidebar-inner"><a href="/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter">Array.prototype.filter()</a></nav></aside>
<main id="content" class="main-content"><article class="main-page-content" lang="en-US"><header><h1>Array.prototype.map()</h1></header>
<section aria-labelledby="syntax"><h2 id="syntax"><a href="#syntax">Syntax</a></h2>
<div class="code-example"><pre class="brush: js notranslate"><code>map(callbackFn)
map(callbackFn, thisArg)</code></pre></div>
<p id="see">See <a href="/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach">forEach</a> or <a href="#syntax">this section</a>.</p></section>
<section aria-labelledby="examples"><h2 id="examples"><a href="#examples">Examples</a></h2>
<h3 id="mapping_an_array"><a href="#mapping_an_array">Mapping an array</a></h3>
<pre class="brush: js notranslate">const roots = numbers.map((num) =&gt; Math.sqrt(num));</pre></section></article></main></div></body></html>`,
};

export const SPHINX: PageFixture = {
  url: "https://docs.python.org/3/library/json.html",
  html: `<!doctype html><html lang="en"><head><title>json — JSON encoder and decoder — Python 3.13 documentation</title>
<link rel="canonical" href="https://docs.python.org/3/library/json.html"></head><body>
<div class="related" role="navigation" aria-label="Related"><ul><li><a href="../index.html">Python</a></li></ul></div>
<div class="document"><div class="documentwrapper"><div class="bodywrapper"><div class="body" role="main">
<section id="module-json"><span id="index-0"></span><h1>json — JSON encoder and decoder<a class="headerlink" href="#module-json" title="Link to this heading">¶</a></h1>
<p>Specified by <a class="rfc reference external" href="https://datatracker.ietf.org/doc/html/rfc7159.html"><strong>RFC 7159</strong></a>.</p>
<section id="basic-usage"><h2>Basic Usage<a class="headerlink" href="#basic-usage" title="Link to this heading">¶</a></h2>
<p id="usage">Serialize an object with <a class="reference internal" href="#json.dumps">json.dumps</a>.</p>
<div class="highlight-python notranslate"><div class="highlight"><pre><span></span><span class="gp">&gt;&gt;&gt; </span><span class="kn">import</span> <span class="nn">json</span>
<span class="gp">&gt;&gt;&gt; </span><span class="n">json</span><span class="o">.</span><span class="n">dumps</span><span class="p">([</span><span class="mi">1</span><span class="p">])</span>
<span class="go">'[1]'</span>
</pre></div></div></section></section></div></div></div></div></body></html>`,
};

export const DOCUSAURUS: PageFixture = {
  url: "https://foo.dev/docs/getting-started",
  html: `<!doctype html><html lang="en" dir="ltr"><head><title>Getting Started | Foo Docs</title>
<link rel="canonical" href="https://foo.dev/docs/getting-started"><meta property="og:site_name" content="Foo"></head><body>
<div id="__docusaurus"><nav class="navbar"><a class="navbar__brand" href="/">Foo</a></nav>
<div class="main-wrapper"><div class="docsWrapper"><aside class="theme-doc-sidebar-container"><nav><a class="menu__link" href="/docs/intro">Intro</a></nav></aside>
<main class="docMainContainer"><article><div class="theme-doc-markdown markdown"><header><h1>Getting Started</h1></header>
<p id="lead">Install with your <a href="/docs/package-managers">package manager</a>.</p>
<h2 class="anchor anchorWithStickyNavbar_x" id="install">Install<a href="#install" class="hash-link" aria-label="Direct link to Install" title="Direct link to Install">&#8203;</a></h2>
<div class="language-bash codeBlockContainer_x theme-code-block"><div class="codeBlockContent_x"><pre tabindex="0" class="prism-code language-bash codeBlock_x thin-scrollbar"><code class="codeBlockLines_x"><span class="token-line" style="color:#393A34"><span class="token plain">npm install foo</span><br></span><span class="token-line" style="color:#393A34"><span class="token plain">npm run build</span><br></span></code></pre><div class="buttonGroup_x"><button type="button" aria-label="Copy code to clipboard" class="clean-btn">Copy</button></div></div></div>
</div></article></main></div></div></div></body></html>`,
};

export const BLOG: PageFixture = {
  url: "https://blog.example.com/posts/why-mvcc?utm_source=feed",
  html: `<!doctype html><html lang="en"><head><title>Why MVCC Matters — Example Blog</title>
<link rel="canonical" href="https://blog.example.com/posts/why-mvcc"><meta name="description" content="A tour of multi-version concurrency control.">
<meta property="og:site_name" content="Example Blog"><meta property="article:published_time" content="2026-03-02T09:00:00Z"><meta name="author" content="Grace Hopper">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","datePublished":"2025-01-01","author":{"@type":"Person","name":"Someone Else"}}</script></head><body>
<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
<article class="post"><h1>Why MVCC Matters</h1><p>Readers never block writers. <a href="https://www.postgresql.org/docs/current/mvcc.html?utm_source=newsletter&amp;utm_medium=email#intro">Postgres docs</a>.</p>
<h2>Snapshots</h2><p id="snap">Each transaction sees a snapshot.</p></article>
<aside class="related"><a href="/posts/other">Other post</a></aside><footer><a href="/privacy">Privacy</a></footer></body></html>`,
};

export const BASE_HREF: PageFixture = {
  url: "https://example.com/page",
  html: `<!doctype html><html><head><title>Base test</title><base href="https://cdn.example.org/docs/v2/"></head>
<body><main><h1 id="t">Base</h1><a href="guide/intro.html">Intro</a><a href="/root.html">Root</a></main></body></html>`,
};

export const SPA_SHELL: PageFixture = {
  url: "https://app.example.com/#/reports",
  html: `<!doctype html><html><head><title>App</title></head><body><div id="root"></div></body></html>`,
};
export const SPA_RENDERED = `<main><h1>Quarterly report</h1><pre><code class="language-ts">const total: number = 1;</code></pre><a href="https://example.com/data">Source data</a></main>`;

export const SHADOW_AND_IFRAME: PageFixture = {
  url: "https://example.com/components",
  html: `<!doctype html><html><head><title>Components</title></head><body><main><h1>Light DOM</h1><pre>light code</pre><div id="host"></div></main></body></html>`,
};

export const DIV_SOUP: PageFixture = {
  url: "https://example.com/soup",
  html: `<!doctype html><html><head><title>  Soup  </title></head><body><div>Title</div><div class="x"><div>Some text</div></div></body></html>`,
};

export const HOSTILE: PageFixture = {
  url: "https://example.com/hostile",
  html: `<!doctype html><html><head><title>Hostile</title></head><body><main><h1>Hostile</h1>
<a href="javascript:alert(1)">js link</a><a href="data:text/html,x">data link</a><a href="mailto:a@b.c">mail</a><a href="https://ok.example.org/x">fine</a>
<pre><script>alert(1)</script>text</pre><pre>${"x".repeat(60_000)}</pre></main></body></html>`,
};

export function hugePage(): PageFixture {
  const headings = Array.from({ length: 2000 }, (_, i) => `<h2 id="h${i}">Heading ${i}</h2><p>text ${i} <a href="https://example.com/l${i}">link ${i}</a></p>`).join("");
  const code = Array.from({ length: 300 }, (_, i) => `<pre><code class="language-js">const v${i} = ${i};</code></pre>`).join("");
  return { url: "https://example.com/huge", html: `<!doctype html><html><head><title>Huge</title></head><body><main>${headings}${code}</main></body></html>` };
}
