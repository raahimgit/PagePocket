import { normalizeTag } from "../library/tags";
import { fold, wordTokens, words } from "./tokenize";

export interface QueryTerm {
  text: string;
  prefix: boolean;
}

export interface ParsedQuery {
  terms: QueryTerm[];
  phrases: string[];
  tags: (string | null)[];
  types: string[];
  sites: string[];
}

const TOKEN = /"([^"]*)"|(\S+)/g;
const FILTER = /^(tag|type|site):(.*)$/i;

function collapse(text: string): string {
  return fold(text).replace(/\s+/g, " ").trim();
}

// Syntax: bare words are ANDed; the last one also matches as a prefix.
// "quoted text" is an exact phrase; tag:x, type:code and site:example.com are filters.
export function parseQuery(input: string): ParsedQuery {
  const parsed: ParsedQuery = { terms: [], phrases: [], tags: [], types: [], sites: [] };
  let lastCompound = -1;

  for (const match of input.matchAll(TOKEN)) {
    if (match[1] !== undefined) {
      const phrase = collapse(match[1]);
      if (!phrase) continue;
      parsed.phrases.push(phrase);
      for (const word of words(match[1])) parsed.terms.push({ text: wordTokens(word.word)[0]!, prefix: false });
      continue;
    }

    const raw = match[2]!;
    const filter = FILTER.exec(raw);
    if (filter) {
      const value = filter[2]!.trim();
      if (!value) continue;
      const kind = filter[1]!.toLowerCase();
      if (kind === "tag") parsed.tags.push(normalizeTag(value));
      else if (kind === "type") parsed.types.push(value.toLowerCase());
      else parsed.sites.push(value.toLowerCase());
      continue;
    }

    for (const word of words(raw)) {
      const [compound, ...parts] = wordTokens(word.word);
      if (!compound) continue;
      parsed.terms.push({ text: compound, prefix: false });
      lastCompound = parsed.terms.length - 1;
      for (const part of parts) parsed.terms.push({ text: part, prefix: false });
    }
  }

  const last = parsed.terms[lastCompound];
  if (last && last.text.length >= 2 && input.trim() && !/"\s*$/.test(input.trim())) last.prefix = true;
  return parsed;
}

export { collapse as collapsePhrase };
