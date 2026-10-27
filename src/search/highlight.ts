import { parseQuery } from "./query";
import { wordTokens, words } from "./tokenize";

export interface Segment {
  text: string;
  hit: boolean;
}

const MAX_HIGHLIGHT_CHARS = 60_000;

// Matches on word boundaries of the original text so offsets stay correct even
// though matching itself is accent- and case-insensitive.
export function highlight(text: string, query: string): Segment[] {
  const { terms } = parseQuery(query);
  if (!terms.length || text.length > MAX_HIGHLIGHT_CHARS) return [{ text, hit: false }];

  const exact = new Set(terms.filter((t) => !t.prefix).map((t) => t.text));
  const prefixes = terms.filter((t) => t.prefix).map((t) => t.text);

  const segments: Segment[] = [];
  let cursor = 0;
  const push = (end: number, hit: boolean) => {
    if (end > cursor) segments.push({ text: text.slice(cursor, end), hit });
    cursor = Math.max(cursor, end);
  };

  for (const { word, start, end } of words(text)) {
    const hit = wordTokens(word).some((t) => exact.has(t) || prefixes.some((p) => t.startsWith(p)));
    if (!hit) continue;
    push(start, false);
    push(end, true);
  }
  push(text.length, false);
  return segments;
}
