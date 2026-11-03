import { openLibrary } from "../library/default";
import { friendlyError } from "../library/errors";
import type { SaveSpec } from "../library/library";
import { parseTagInput } from "../library/tags";
import { h } from "../shared/dom";
import { plural } from "../shared/format";
import type { Result } from "../shared/messages";
import type { PageCapture } from "../shared/types";
import { loadSettings, saveSettings } from "../storage/settings";
import { api } from "../shared/api";
import { applySavedTheme, toggleTheme, updateThemeButton } from "../shared/theme";

const library = openLibrary();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const status = $("status");
const main = $("main");
const select = $<HTMLSelectElement>("collection");
const tagsInput = $<HTMLInputElement>("tags");
const savePage = $<HTMLButtonElement>("save-page");
const saveSelection = $<HTMLButtonElement>("save-selection");
const saveScreenshot = $<HTMLButtonElement>("save-screenshot");
const noteInput = $<HTMLTextAreaElement>("note");
const themeToggle = $<HTMLButtonElement>("theme-toggle");
const NONE = "";

const WHAT: Record<SaveSpec["kind"], string> = {
  page: "page", selection: "selection", code: "code block", heading: "heading", link: "link",
};

let capture: PageCapture;
let announcements = 0;

function say(message: string, isError = false): void {
  status.textContent = message ? message + (announcements++ % 2 ? "\u00a0" : "") : "";
  status.classList.toggle("error", isError);
}

async function refreshCollections(selectedId?: string): Promise<void> {
  const [collections, settings] = await Promise.all([library.listCollections(), loadSettings()]);
  const wanted = selectedId ?? settings.lastCollectionId;
  select.replaceChildren(
    h("option", { value: NONE }, "No collection"),
    ...collections.map((c) => h("option", { value: c.id }, c.name)),
  );
  select.value = collections.some((c) => c.id === wanted) ? wanted! : NONE;
}

async function save(spec: SaveSpec): Promise<void> {
  try {
    const collectionId = select.value || undefined;
    const { created } = await library.save(capture, spec, collectionId, parseTagInput(tagsInput.value), noteInput.value);
    await saveSettings({ lastCollectionId: collectionId });
    const where = collectionId ? ` to ${select.selectedOptions[0]?.textContent ?? "collection"}` : "";
    say(created ? `Saved ${WHAT[spec.kind]}${where}.` : `This ${WHAT[spec.kind]} was already saved${where ? "; added to the collection" : ""}.`);
  } catch (error) {
    say(friendlyError(error, "Could not save."), true);
  }
}

async function screenshot(): Promise<void> {
  saveScreenshot.disabled = true;
  try {
    say("Select one or more rectangles on the page. Press Escape when finished.");
    const response: Result<{ created: boolean; count: number; itemId: string }> = await api.runtime.sendMessage({
      type: "save-snip",
      collectionId: select.value || undefined,
      tags: parseTagInput(tagsInput.value),
      note: noteInput.value,
    });
    if (!response.ok) { say(response.error.message, true); return; }
  } catch (error) {
    say(friendlyError(error, "Could not capture snip."), true);
  } finally {
    saveScreenshot.disabled = false;
  }
}

function fillList(
  listId: string,
  summaryId: string,
  noun: string,
  entries: { text: string; hint?: string; spec: SaveSpec }[],
): void {
  const summary = $(summaryId);
  summary.textContent = plural(entries.length, noun);
  summary.parentElement!.hidden = entries.length === 0;
  $(listId).replaceChildren(
    ...entries.map((entry) =>
      h("li", {},
        h("span", { class: "text" }, entry.text.slice(0, 160), entry.hint ? h("span", { class: "lang" }, entry.hint) : ""),
        h("button", { type: "button", "aria-label": `Save ${noun}: ${entry.text.slice(0, 40)}`, onclick: () => void save(entry.spec) }, "Save")),
    ),
  );
}

function render(): void {
  $("page-title").textContent = capture.source.pageTitle || "(untitled)";
  $("page-url").textContent = capture.source.url;

  const hasSelection = capture.selection !== null;
  saveSelection.disabled = !hasSelection;
  $("selection-hint").textContent = hasSelection ? "" : "Select text on the page to save an excerpt.";
  const primary = hasSelection ? saveSelection : savePage;
  primary.classList.add("primary");

  fillList("code-list", "code-summary", "code block",
    capture.codeBlocks.map((b, index) => ({ text: b.content.split("\n")[0] ?? "", hint: b.language, spec: { kind: "code", index } })));
  fillList("heading-list", "heading-summary", "heading",
    capture.headings.map((x, index) => ({ text: x.text, hint: `h${x.level}`, spec: { kind: "heading", index } })));
  fillList("link-list", "link-summary", "link",
    capture.links.map((x, index) => ({ text: x.text, spec: { kind: "link", index } })));

  main.hidden = false;
  say(capture.warnings.length ? `Captured with warnings: ${capture.warnings.join("; ")}` : "");
  primary.focus();
}

savePage.addEventListener("click", () => void save({ kind: "page" }));
saveSelection.addEventListener("click", () => void save({ kind: "selection" }));
saveScreenshot.addEventListener("click", () => void screenshot());
void applySavedTheme().then((theme) => updateThemeButton(themeToggle, theme));
themeToggle.addEventListener("click", () => void toggleTheme().then((theme) => updateThemeButton(themeToggle, theme)));
tagsInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void save(capture.selection ? { kind: "selection" } : { kind: "page" });
});

$("open-library").addEventListener("click", () => {
  void api.runtime.openOptionsPage();
  window.close();
});

$<HTMLFormElement>("new-collection").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $<HTMLInputElement>("new-name");
  try {
    const created = await library.createCollection(input.value);
    input.value = "";
    await refreshCollections(created.id);
    say(`Created collection ${created.name}.`);
  } catch (error) {
    say(friendlyError(error, "Could not create collection."), true);
  }
});

(async () => {
  const response: Result<PageCapture> = await api.runtime.sendMessage({ type: "capture-page" });
  if (!response.ok) {
    say(response.error.message, true);
    $("open-library").focus();
    return;
  }
  capture = response.data;
  await refreshCollections();
  const known = await library.listTags();
  $("known-tags").replaceChildren(...known.map(({ tag }) => h("option", { value: tag })));
  render();
})();
