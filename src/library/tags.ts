import { LibraryError } from "./errors";

export const MAX_TAGS_PER_ITEM = 30;
const MAX_TAG_LENGTH = 40;

export function normalizeTag(raw: string): string | null {
  const tag = raw
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_.+#-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return tag && tag.length <= MAX_TAG_LENGTH ? tag : null;
}

export function parseTagInput(text: string): string[] {
  return text.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
}

export function normalizeTagList(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (!tag) throw new LibraryError("invalid-input", `"${entry}" is not a valid tag (max ${MAX_TAG_LENGTH} characters)`);
    seen.add(tag);
  }
  return [...seen];
}
