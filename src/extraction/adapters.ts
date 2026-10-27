export interface SiteAdapter {
  name: string;
  matches(url: URL): boolean;
  mainRoot(doc: Document): Element | null;
}

// Ordered by specificity. Covers MDN, Docusaurus, MkDocs, Sphinx and most blogs.
const GENERIC_ROOTS = [
  "main",
  '[role="main"]',
  "article",
  "#main-content",
  "#content",
  ".markdown-body",
  ".post-content",
  ".article-body",
];

const github: SiteAdapter = {
  name: "github",
  matches: (url) => url.hostname === "github.com",
  mainRoot(doc) {
    // A repository page has one rendered README; issues and PRs have many
    // .markdown-body nodes, where the whole <main> is the right scope.
    const bodies = doc.querySelectorAll("article.markdown-body");
    return bodies.length === 1 ? bodies[0]! : doc.querySelector("main");
  },
};

const ADAPTERS: SiteAdapter[] = [github];

export function findAdapter(url: string): SiteAdapter | undefined {
  try {
    const parsed = new URL(url);
    return ADAPTERS.find((a) => a.matches(parsed));
  } catch {
    return undefined;
  }
}

export function findMainRoot(doc: Document): { root: ParentNode; adapter?: string } {
  const adapter = findAdapter(doc.URL);
  const adapterRoot = adapter?.mainRoot(doc);
  if (adapter && adapterRoot) return { root: adapterRoot, adapter: adapter.name };

  for (const selector of GENERIC_ROOTS) {
    const el = doc.querySelector(selector);
    if (el) return { root: el };
  }
  return { root: doc.body ?? doc };
}
