import { JSDOM } from "jsdom";

export function dom(html: string, url = "https://example.com/docs/page"): Document {
  return new JSDOM(html, { url }).window.document;
}

export function select(doc: Document, el: Element): void {
  const range = doc.createRange();
  range.selectNodeContents(el);
  const selection = doc.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}
