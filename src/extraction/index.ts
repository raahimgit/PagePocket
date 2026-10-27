import type { PageCapture } from "../shared/types";
import { findMainRoot } from "./adapters";
import { extractCodeBlocks } from "./code";
import { collectHeadingElements, extractHeadings } from "./headings";
import { extractLinks } from "./links";
import { extractMetadata } from "./metadata";
import { captureSelection } from "./selection";

export { normalizeUrl } from "./url";

// Each stage is isolated: a failure in one (hostile markup, unexpected DOM)
// degrades the capture instead of aborting it.
export function extractPage(doc: Document): PageCapture {
  const warnings: string[] = [];
  const attempt = <T>(label: string, fallback: T, fn: () => T): T => {
    try {
      return fn();
    } catch {
      warnings.push(`${label} could not be extracted`);
      return fallback;
    }
  };

  const url = doc.URL;
  const { root } = attempt("Main content", { root: doc as ParentNode }, () => findMainRoot(doc));
  const headingElements = attempt("Headings", [] as Element[], () => collectHeadingElements(doc));

  const metadata = attempt("Metadata", {}, () => extractMetadata(doc));

  return {
    source: { url, canonicalUrl: metadata.canonicalUrl, pageTitle: doc.title.trim() },
    metadata,
    headings: attempt("Headings", [], () => extractHeadings(collectHeadingElements(root), url)),
    links: attempt("Links", [], () => extractLinks(root, doc.baseURI, url)),
    codeBlocks: attempt("Code blocks", [], () => extractCodeBlocks(root, headingElements)),
    selection: attempt("Selection", null, () => captureSelection(doc, headingElements)),
    warnings,
  };
}
