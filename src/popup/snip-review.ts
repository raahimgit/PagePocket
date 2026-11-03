import { openLibrary } from "../library/default";
import { friendlyError } from "../library/errors";
import { h, safeHref } from "../shared/dom";
import type { PageCapture } from "../shared/types";
import { api } from "../shared/api";
import { recognizeText } from "./ocr";

const library = openLibrary();
const status = document.getElementById("status")!;
const text = document.getElementById("ocr-text") as HTMLTextAreaElement;
const saveButton = document.getElementById("save-text") as HTMLButtonElement;
let screenshotItem: Awaited<ReturnType<typeof library.listItems>>[number] | undefined;

function say(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function saveText(): Promise<void> {
  const excerpt = text.value.trim();
  if (!excerpt || !screenshotItem) return;
  saveButton.disabled = true;
  try {
    const capture: PageCapture = {
      source: screenshotItem.source,
      metadata: {},
      headings: [],
      links: [],
      codeBlocks: [],
      selection: { text: excerpt },
      warnings: [],
    };
    const saved = await library.save(capture, { kind: "selection" }, undefined, screenshotItem.tags);
    for (const collectionId of screenshotItem.collectionIds) {
      await library.addToCollection(saved.item.id, collectionId);
    }
    say(saved.created ? "Extracted text saved to your library." : "This extracted text was already saved.");
  } catch (error) {
    say(friendlyError(error, "Could not save extracted text."), true);
  } finally {
    saveButton.disabled = false;
  }
}

document.getElementById("open-library")!.addEventListener("click", () => void api.runtime.openOptionsPage());
saveButton.addEventListener("click", () => void saveText());

void (async () => {
  try {
    const id = new URL(location.href).searchParams.get("id");
    if (!id) throw new Error("Snip reference is missing.");
    screenshotItem = (await library.listItems()).find((item) => item.id === id && item.type === "screenshot");
    if (!screenshotItem) throw new Error("Could not find the saved snip.");

    const preview = document.getElementById("preview") as HTMLImageElement;
    preview.src = screenshotItem.content;
    preview.alt = `Snip from ${screenshotItem.source.pageTitle || screenshotItem.source.url}`;
    const source = document.getElementById("source")!;
    source.append("Source: ");
    const url = safeHref(screenshotItem.source.url);
    source.append(url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, screenshotItem.source.pageTitle || url) : document.createTextNode(screenshotItem.source.pageTitle || screenshotItem.source.url));

    say("Reading text locally…");
    text.value = await recognizeText(screenshotItem.content, (progress) => {
      if (progress.status === "recognizing text") say(`Reading text locally… ${Math.round(progress.progress * 100)}%`);
    });
    text.disabled = false;
    saveButton.disabled = false;
    say(text.value.trim() ? "Review or edit the recognized text, then save it as an excerpt." : "No text was recognized. You can enter text manually before saving.");
    text.focus();
  } catch (error) {
    say(friendlyError(error, "Could not extract text from the snip."), true);
  }
})();
