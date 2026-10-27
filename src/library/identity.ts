import { normalizeUrl } from "../extraction/url";
import type { Item } from "../shared/types";

// Two captures are the same research item when they come from the same page
// (ignoring fragments and tracking params) and carry the same type and content.
export function itemKey(item: Pick<Item, "type" | "content" | "targetUrl" | "source">): string {
  const page = normalizeUrl(item.source.url) ?? item.source.url;
  return [item.type, page, item.content, item.targetUrl ?? ""].join("\u0000");
}
