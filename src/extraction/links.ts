import type { LinkRef } from "../shared/types";
import { collapseWhitespace, isBoilerplate } from "./dom";
import { normalizeUrl } from "./url";

const MAX_LINKS = 100;

export function extractLinks(root: ParentNode, baseUri: string, pageUrl: string): LinkRef[] {
  const self = normalizeUrl(pageUrl);
  const seen = new Map<string, LinkRef>();

  for (const a of root.querySelectorAll("a[href]")) {
    if (seen.size >= MAX_LINKS) break;
    if (isBoilerplate(a)) continue;
    const url = normalizeUrl(a.getAttribute("href") ?? "", baseUri);
    if (!url || url === self) continue;
    const text = collapseWhitespace(a.textContent ?? "") || a.getAttribute("aria-label") || a.getAttribute("title") || "";
    if (!text.trim()) continue;
    if (!seen.has(url)) seen.set(url, { url, text: collapseWhitespace(text) });
  }
  return [...seen.values()];
}
