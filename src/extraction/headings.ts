import type { HeadingRef } from "../shared/types";
import { collapseWhitespace, isBoilerplate } from "./dom";
import { withFragment } from "./url";

const MAX_HEADINGS = 200;

// Sphinx and Doxygen append a permalink glyph to the heading text.
const PERMALINK_GLYPH = /\s*[¶§#]\s*$/;

function headingText(el: Element): string {
  return collapseWhitespace(el.textContent ?? "").replace(PERMALINK_GLYPH, "");
}

export function collectHeadingElements(root: ParentNode): Element[] {
  return [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(
    (el) => !isBoilerplate(el) && headingText(el) !== "",
  );
}

// Where the fragment lives depends on the site generator: on the heading itself
// (MDN, Docusaurus), on a permalink inside it (Sphinx headerlink), or on a
// sibling anchor in a wrapper (GitHub's .markdown-heading).
function anchorId(el: Element): string | undefined {
  if (el.id) return el.id;
  const inner = el.querySelector("[id]")?.id;
  if (inner) return inner;
  const link =
    el.querySelector('a[href^="#"]') ??
    el.parentElement?.querySelector(':scope > a.anchor[href^="#"], :scope > a[aria-label^="Permalink"][href^="#"]');
  const fragment = link?.getAttribute("href")?.slice(1);
  if (!fragment) return undefined;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

export function extractHeadings(elements: Element[], pageUrl: string): HeadingRef[] {
  return elements.slice(0, MAX_HEADINGS).map((el) => {
    const id = anchorId(el);
    return {
      level: Number(el.tagName.slice(1)),
      text: headingText(el),
      id,
      url: id ? withFragment(pageUrl, id) : undefined,
    };
  });
}

// `headings` must be in document order. Returns the closest heading that
// precedes (or contains) the node, or undefined when there is none.
export function nearestHeading(node: Node, headings: Element[]): string | undefined {
  // `Node` is a browser global, but extraction is also exercised against
  // jsdom in Node where the constructor is not installed on globalThis.
  // The DOM constant is stable across implementations (4).
  const following = 4;
  let lo = 0;
  let hi = headings.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const heading = headings[mid]!;
    if (heading.compareDocumentPosition(node) & following) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const match = found >= 0 ? headings[found] : undefined;
  return match ? headingText(match) : undefined;
}
