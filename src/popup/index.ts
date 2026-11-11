import { openLibrary } from "../library/default";
import { friendlyError } from "../library/errors";
import type { SaveSpec } from "../library/library";
import { parseTagInput } from "../library/tags";
import { h } from "../shared/dom";
import type { Result } from "../shared/messages";
import type { PageCapture } from "../shared/types";
import { loadSettings, saveSettings } from "../storage/settings";
import { api } from "../shared/api";
import { applySavedTheme, toggleTheme } from "../shared/theme";

const library = openLibrary();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const status = $("status");
const main = $("main");
const select = $<HTMLSelectElement>("collection");
const tagsInput = $<HTMLInputElement>("tags");
const savePage = $<HTMLButtonElement>("save-page");
const saveSelection = $<HTMLButtonElement>("save-selection");
const saveScreenshot = $<HTMLButtonElement>("save-screenshot");
const footer = $("capture-footer");
const tagChips = $("tag-chips");
const noteInput = $<HTMLTextAreaElement>("note");
const themeToggle = $<HTMLButtonElement>("theme-toggle");
const NONE = "";

const WHAT: Record<SaveSpec["kind"], string> = {
  page: "page", selection: "selection", code: "code block", heading: "heading", link: "link",
};

let capture: PageCapture;
let announcements = 0;
let selectedTags: string[] = [];

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
    const { created } = await library.save(capture, spec, collectionId, getTags(), noteInput.value);
    await saveSettings({ lastCollectionId: collectionId });
    const where = collectionId ? ` to ${select.selectedOptions[0]?.textContent ?? "collection"}` : "";
    say(created ? `Saved ${WHAT[spec.kind]}${where}.` : `This ${WHAT[spec.kind]} was already saved${where ? "; added to the collection" : ""}.`);
  } catch (error) {
    say(friendlyError(error, "Could not save."), true);
  }
}

function getTags(): string[] {
  return [...new Set([...selectedTags, ...parseTagInput(tagsInput.value)])];
}

function renderTags(): void {
  tagChips.replaceChildren(...selectedTags.map((tag) =>
    h("span", { class: "tag-chip" }, tag,
      h("button", {
        type: "button",
        "aria-label": `Remove tag ${tag}`,
        onclick: () => { selectedTags = selectedTags.filter((item) => item !== tag); renderTags(); },
      }, "×")),
  ));
}

function addTags(value = tagsInput.value): void {
  const incoming = parseTagInput(value);
  selectedTags = [...new Set([...selectedTags, ...incoming])];
  tagsInput.value = "";
  renderTags();
}

async function screenshot(): Promise<void> {
  saveScreenshot.disabled = true;
  try {
    say("Select one or more rectangles on the page. Press Escape when finished.");
    const response: Result<{ created: boolean; count: number; itemId: string }> = await api.runtime.sendMessage({
      type: "save-snip",
      collectionId: select.value || undefined,
      tags: getTags(),
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
  const singularLabel = noun === "heading" ? "heading detected" : noun === "link" ? "link detected" : noun;
  const pluralLabel = noun === "heading" ? "headings detected" : noun === "link" ? "links detected" : `${noun}s`;
  summary.textContent = entries.length === 1 ? `1 ${singularLabel}` : `${entries.length} ${pluralLabel}`;
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
  footer.hidden = false;
  say(capture.warnings.length ? `Captured with warnings: ${capture.warnings.join("; ")}` : "");
  primary.focus();
}

savePage.addEventListener("click", () => void save({ kind: "page" }));
saveSelection.addEventListener("click", () => void save({ kind: "selection" }));
saveScreenshot.addEventListener("click", () => void screenshot());
tagsInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    addTags();
  }
});
tagsInput.addEventListener("input", () => {
  if (!tagsInput.value.includes(",")) return;
  addTags();
});
$("new-collection-toggle").addEventListener("click", () => {
  const form = $<HTMLFormElement>("new-collection");
  form.hidden = !form.hidden;
  $("new-collection-toggle").setAttribute("aria-expanded", String(!form.hidden));
  if (!form.hidden) $<HTMLInputElement>("new-name").focus();
});
document.addEventListener("keydown", (event) => {
  if (!event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  const key = event.key.toLowerCase();
  if (key === "s") { event.preventDefault(); void screenshot(); }
});
function setPopupThemeButton(theme: "light" | "dark"): void {
  themeToggle.innerHTML = theme === "dark"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/></svg>';
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  themeToggle.title = `Switch to ${theme === "dark" ? "light" : "dark"} theme`;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}

void applySavedTheme().then(setPopupThemeButton);
themeToggle.addEventListener("click", () => void toggleTheme().then(setPopupThemeButton));
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
