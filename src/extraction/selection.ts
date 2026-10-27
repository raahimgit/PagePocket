import type { SelectionCapture } from "../shared/types";
import { clip } from "./dom";
import { nearestHeading } from "./headings";

const MAX_SELECTION_CHARS = 100_000;

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Chrome returns "" from Selection.toString() when the selection is inside an
// <input> or <textarea>, so those controls are read directly.
function textControlSelection(doc: Document): { text: string; node: Node } | null {
  const active = doc.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (active?.tagName !== "TEXTAREA" && active?.tagName !== "INPUT") return null;
  const { selectionStart, selectionEnd, value } = active;
  if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) return null;
  return { text: value.slice(selectionStart, selectionEnd), node: active };
}

export function captureSelection(doc: Document, headings: Element[]): SelectionCapture | null {
  const control = textControlSelection(doc);
  const selection = doc.getSelection();

  let raw: string;
  let anchor: Node | null;
  if (control) {
    raw = control.text;
    anchor = control.node;
  } else if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    raw = selection.toString();
    anchor = selection.getRangeAt(0).startContainer;
  } else {
    return null;
  }

  const text = tidy(raw);
  if (!text) return null;

  const { text: clipped } = clip(text, MAX_SELECTION_CHARS);
  return { text: clipped, headingContext: anchor ? nearestHeading(anchor, headings) : undefined };
}
