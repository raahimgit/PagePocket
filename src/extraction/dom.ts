const BOILERPLATE =
  "nav, footer, aside, [role=navigation], [role=complementary], [role=contentinfo], [hidden], [aria-hidden=true]";

export function isBoilerplate(el: Element): boolean {
  return el.closest(BOILERPLATE) !== null;
}

// Zero-width characters are not whitespace to JS but show up in permalink
// anchors (Docusaurus appends U+200B) and would leak into titles.
export function collapseWhitespace(text: string): string {
  return text.replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

export function clip(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}
