import { openLibrary } from "../library/default";
import { friendlyError } from "../library/errors";
import { h, safeHref } from "../shared/dom";
import { api } from "../shared/api";
import { recognizeText } from "./ocr";
import { applySavedTheme } from "../shared/theme";

const library = openLibrary();
const status = document.getElementById("status")!;
const text = document.getElementById("ocr-text") as HTMLTextAreaElement;
const saveButton = document.getElementById("save-text") as HTMLButtonElement;
const ocrResult = document.getElementById("ocr-result")!;
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
    const notes = await library.notesFor({ kind: "item", id: screenshotItem.id });
    const existing = notes.find((note) => note.body.startsWith("Extracted text from this snip:\n"));
    const body = `Extracted text from this snip:\n${excerpt}`;
    if (existing) await library.updateNote(existing.id, body);
    else await library.addNote({ kind: "item", id: screenshotItem.id }, body);
    say("Extracted text saved with the snip in your library.");
  } catch (error) {
    say(friendlyError(error, "Could not save extracted text."), true);
  } finally {
    saveButton.disabled = false;
  }
}

async function extractText(): Promise<void> {
  if (!screenshotItem) return;
  say("Reading text locally…");
  try {
    text.value = await recognizeText(screenshotItem.content, (progress) => {
      if (progress.status === "recognizing text") say(`Reading text locally… ${Math.round(progress.progress * 100)}%`);
    });
    ocrResult.hidden = false;
    text.disabled = false;
    saveButton.disabled = false;
    say(text.value.trim() ? "Review or edit the recognized text, then save it as an excerpt." : "No text was recognized. You can enter text manually before saving.");
    text.focus();
  } catch (error) {
    say(friendlyError(error, "Could not extract text from the snip."), true);
  }
}

document.getElementById("open-library")!.addEventListener("click", () => void api.runtime.openOptionsPage());
saveButton.addEventListener("click", () => void saveText());
void applySavedTheme();

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

    await extractText();
  } catch (error) {
    say(friendlyError(error, "Could not extract text from the snip."), true);
  }
})();
