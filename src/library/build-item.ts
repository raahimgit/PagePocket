import type { Item, PageCapture } from "../shared/types";
import { LibraryError } from "./errors";

export type SaveSpec =
  | { kind: "page" }
  | { kind: "selection" }
  | { kind: "code"; index: number }
  | { kind: "heading"; index: number }
  | { kind: "link"; index: number };

export type ItemDraft = Omit<Item, "id" | "capturedAt" | "tags" | "collectionIds">;

function pick<T>(list: T[], index: number, what: string): T {
  const value = list[index];
  if (value === undefined) throw new LibraryError("invalid-input", `No ${what} at index ${index}`);
  return value;
}

export function buildItem(capture: PageCapture, spec: SaveSpec): ItemDraft {
  const source = { ...capture.source };
  switch (spec.kind) {
    case "page":
      return { type: "page", source, content: capture.metadata.description ?? "" };
    case "selection": {
      if (!capture.selection) throw new LibraryError("invalid-input", "Nothing is selected");
      return { type: "excerpt", source, content: capture.selection.text, headingContext: capture.selection.headingContext };
    }
    case "code": {
      const block = pick(capture.codeBlocks, spec.index, "code block");
      return { type: "code", source, content: block.content, language: block.language, headingContext: block.headingContext };
    }
    case "heading": {
      const heading = pick(capture.headings, spec.index, "heading");
      return { type: "heading", source, content: heading.text, targetUrl: heading.url };
    }
    case "link": {
      const link = pick(capture.links, spec.index, "link");
      return { type: "link", source, content: link.text, targetUrl: link.url };
    }
  }
}

export function buildScreenshot(source: PageCapture["source"], dataUrl: string): ItemDraft {
  return { type: "screenshot", source: { ...source }, content: dataUrl };
}
