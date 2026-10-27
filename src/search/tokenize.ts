const WORD = /[\p{L}\p{N}]+/gu;
// camelCase, PascalCase acronyms (HTTPServer), and letter/digit boundaries.
const BOUNDARY = /(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u;
const MAX_TOKEN = 64;

const PLAIN = /^[a-z0-9]+$/;
const NEEDS_SPLIT = /[\p{Lu}\p{N}]/u;

export function fold(text: string): string {
  if (PLAIN.test(text)) return text;
  return text.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
}

// The whole word comes first, then its sub-words, so `getUserById` is found by
// `getuserbyid`, `user` or `id`.
export function wordTokens(word: string): string[] {
  if (!NEEDS_SPLIT.test(word)) {
    const only = fold(word);
    return only.length > 0 && only.length <= MAX_TOKEN ? [only] : [];
  }
  const tokens = new Set<string>([fold(word)]);
  for (const part of word.split(BOUNDARY)) tokens.add(fold(part));
  return [...tokens].filter((t) => t.length > 0 && t.length <= MAX_TOKEN);
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(WORD)) out.push(...wordTokens(match[0]));
  return out;
}

export function words(text: string): { word: string; start: number; end: number }[] {
  return [...text.matchAll(WORD)].map((m) => ({ word: m[0], start: m.index!, end: m.index! + m[0].length }));
}
