import type { PageMetadata } from "../shared/types";
import { collapseWhitespace } from "./dom";
import { normalizeUrl } from "./url";

const MAX_JSON_LD_CHARS = 200_000;

function metaContent(doc: Document, key: string): string | undefined {
  const el = doc.querySelector(`meta[name="${key}"], meta[property="${key}"]`);
  const value = collapseWhitespace(el?.getAttribute("content") ?? "");
  return value || undefined;
}

function jsonLdFields(doc: Document): { author?: string; publishedAt?: string } {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.textContent ?? "";
    if (raw.length > MAX_JSON_LD_CHARS) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const flat = nodes.flatMap((n) => {
      const graph = (n as { "@graph"?: unknown })?.["@graph"];
      return Array.isArray(graph) ? graph : [n];
    });
    for (const node of flat) {
      if (typeof node !== "object" || node === null) continue;
      const record = node as Record<string, unknown>;
      const published = typeof record.datePublished === "string" ? record.datePublished : undefined;
      const author = record.author as { name?: unknown } | { name?: unknown }[] | string | undefined;
      const first = Array.isArray(author) ? author[0] : author;
      const name = typeof first === "string" ? first : typeof first?.name === "string" ? first.name : undefined;
      if (published || name) return { author: name, publishedAt: published };
    }
  }
  return {};
}

export function extractMetadata(doc: Document): PageMetadata {
  const canonicalHref = doc.querySelector('link[rel~="canonical"]')?.getAttribute("href");
  // The canonical link is page-controlled and can point anywhere. It is stored
  // as metadata only; the captured `url` always remains the address actually visited.
  const canonicalUrl = canonicalHref ? normalizeUrl(canonicalHref, doc.baseURI) ?? undefined : undefined;
  const ld = jsonLdFields(doc);

  return {
    canonicalUrl,
    description: metaContent(doc, "description") ?? metaContent(doc, "og:description"),
    author: metaContent(doc, "author") ?? ld.author,
    publishedAt: metaContent(doc, "article:published_time") ?? ld.publishedAt,
    siteName: metaContent(doc, "og:site_name"),
    language: doc.documentElement.lang || undefined,
  };
}
