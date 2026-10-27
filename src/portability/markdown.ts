import { normalizeUrl } from "../extraction/url";
import { safeHref } from "../shared/dom";
import type { Item, Note } from "../shared/types";

export interface MarkdownInput {
  scope: { name: string; description?: string } | null;
  collectionNotes: Note[];
  items: Item[];
  notes: Note[];
  exportedAt: string;
}

const day = (iso: string) => iso.slice(0, 10);

function escapeInline(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\\`*_[\]<>]/g, "\\$&");
}

// Captured text is untrusted: neutralize raw HTML and anything that would turn
// into structure (headings, lists, fences) inside the quote.
function escapeBlock(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/</g, "\\<").replace(/^(\s*)([#>*+\-`~]|\d+[.)])/, "$1\\$2"))
    .join("\n");
}

function blockquote(text: string): string {
  return escapeBlock(text).split("\n").map((line) => (line.trim() ? `> ${line}` : ">")).join("\n");
}

function fenced(content: string, language: string | undefined): string {
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  const info = language && /^[\w+#.-]+$/.test(language) ? language : "";
  return `${fence}${info}\n${content}\n${fence}`;
}

function linkOrCode(url: string): string {
  const href = safeHref(url);
  return href ? `<${href}>` : `\`${url.replace(/`/g, "'")}\``;
}

function notesBlock(notes: Note[]): string[] {
  if (!notes.length) return [];
  const sorted = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return [
    "**Notes**",
    "",
    ...sorted.map((n) => `- ${n.body.trim().replace(/\r\n?/g, "\n").split("\n").join("\n  ")}`),
    "",
  ];
}

function itemBlock(item: Item, notes: Note[]): string[] {
  const out: string[] = [];
  const meta = [`Captured: ${day(item.capturedAt)}`];
  if (item.headingContext) meta.push(`Section: ${escapeInline(item.headingContext)}`);

  switch (item.type) {
    case "page":
      out.push("### Saved page", "");
      if (item.content) out.push(blockquote(item.content), "");
      break;
    case "excerpt":
      out.push("### Excerpt", "", blockquote(item.content), "");
      break;
    case "code":
      out.push(`### Code${item.language ? ` (${escapeInline(item.language)})` : ""}`, "", fenced(item.content, item.language), "");
      break;
    case "heading":
      out.push(`### Heading: ${escapeInline(item.content)}`, "");
      if (item.targetUrl) out.push(`Link: ${linkOrCode(item.targetUrl)}`, "");
      break;
    case "link":
      out.push(`### Link: ${escapeInline(item.content)}`, "");
      if (item.targetUrl) out.push(`Target: ${linkOrCode(item.targetUrl)}`, "");
      break;
    case "screenshot":
      out.push("### Screenshot", "", "Visual capture saved locally; open the source to revisit the original context.", "");
      break;
  }

  out.push(meta.join(" · "), "");
  if (item.tags.length) out.push(`Tags: ${item.tags.map((t) => `\`${t}\``).join(", ")}`, "");
  out.push(...notesBlock(notes));
  return out;
}

export function renderMarkdown(input: MarkdownInput): string {
  const out: string[] = [`# ${escapeInline(input.scope?.name ?? "ContextLens export")}`, ""];
  if (input.scope?.description) out.push(blockquote(input.scope.description), "");
  out.push(
    `_Exported from ContextLens on ${day(input.exportedAt)}. Excerpts, code and links below were captured from the sources listed and remain the work of their original authors._`,
    "",
  );

  if (input.collectionNotes.length) out.push("## Collection notes", "", ...notesBlock(input.collectionNotes));

  const notesByItem = new Map<string, Note[]>();
  for (const note of input.notes) {
    if (note.target.kind !== "item") continue;
    notesByItem.set(note.target.id, [...(notesByItem.get(note.target.id) ?? []), note]);
  }

  const groups = new Map<string, Item[]>();
  for (const item of input.items) {
    const key = normalizeUrl(item.source.url) ?? item.source.url;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
  }
  const ordered = [...groups.entries()].sort(
    ([ka, a], [kb, b]) => a[0]!.capturedAt.localeCompare(b[0]!.capturedAt) || ka.localeCompare(kb),
  );

  if (!ordered.length) out.push("_No items._", "");

  for (const [, list] of ordered) {
    const first = list[0]!;
    out.push(`## ${escapeInline(first.source.pageTitle || first.source.url)}`, "");
    out.push(`- Source: ${linkOrCode(first.source.url)}`);
    const canonical = first.source.canonicalUrl;
    if (canonical && (normalizeUrl(canonical) ?? canonical) !== (normalizeUrl(first.source.url) ?? first.source.url)) {
      out.push(`- Canonical: ${linkOrCode(canonical)}`);
    }
    out.push("");
    for (const item of list) out.push(...itemBlock(item, notesByItem.get(item.id) ?? []));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "contextlens";
}
