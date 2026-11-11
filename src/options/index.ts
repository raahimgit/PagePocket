import { openLibrary } from "../library/default";
import { h } from "../shared/dom";
import { plural } from "../shared/format";
import type { Note } from "../shared/types";
import { initDataTools } from "./data-tools";
import { renderItem, renderNotes, type ItemContext } from "./items";
import { $, guarded, keyed, restoreUi, say, snapshotUi } from "./ui";
import { applySavedTheme, toggleTheme, updateThemeButton } from "../shared/theme";

const library = openLibrary();
const ALL = "__all__";
const state = { view: ALL, query: "", editing: {} as { noteId?: string } };
const themeToggle = $<HTMLButtonElement>("theme-toggle");
void applySavedTheme().then((theme) => updateThemeButton(themeToggle, theme));
themeToggle.addEventListener("click", () => void toggleTheme().then((theme) => updateThemeButton(themeToggle, theme)));

const notesFor = (notes: Note[], kind: Note["target"]["kind"], id: string) =>
  notes.filter((n) => n.target.kind === kind && n.target.id === id);

async function render(): Promise<void> {
  const snapshot = snapshotUi();
  const [collections, allItems, allNotes, tags] = await Promise.all([
    library.listCollections(), library.listItems(), library.listNotes(), library.listTags(),
  ]);
  if (state.view !== ALL && !collections.some((c) => c.id === state.view)) state.view = ALL;
  const selected = collections.find((c) => c.id === state.view);
  const scope = selected?.id;
  const searching = state.query.trim() !== "";

  const count = (id: string) => allItems.filter((i) => i.collectionIds.includes(id)).length;
  const tab = (id: string, label: string) =>
    h("li", {}, keyed(h("button", { type: "button", "aria-current": String(state.view === id), onclick: () => { state.view = id; void render(); } }, label), `nav:${id}`));
  $("collections").replaceChildren(
    tab(ALL, `All items (${allItems.length})`),
    ...collections.map((c) => tab(c.id, `${c.name} (${count(c.id)})`)),
  );
  $("tags").replaceChildren(
    ...(tags.length
      ? tags.map(({ tag, count: n }) => h("li", {}, keyed(h("button", { type: "button", onclick: () => setQuery(`tag:${tag}`) }, `${tag} (${n})`), `tag:${tag}`)))
      : [h("li", { class: "meta muted" }, "No tags yet.")]),
  );

  $("collection-tools").hidden = !selected;
  if (selected) $<HTMLInputElement>("rename").value = selected.name;
  const ctx: ItemContext = { library, query: state.query, collections, editing: state.editing, refresh: render };

  $("collection-notes").replaceChildren(
    ...(selected
      ? [h("section", { "aria-labelledby": "collection-notes-heading", class: "group" },
          h("h3", { id: "collection-notes-heading", class: "group-label" }, "Collection notes"),
          renderNotes(ctx, { kind: "collection", id: selected.id }, notesFor(allNotes, "collection", selected.id), `collection:${selected.id}`, `collection ${selected.name}`))]
      : []),
  );

  const items = searching
    ? (await library.search(state.query, { collectionId: scope })).map((r) => r.item)
    : allItems.filter((i) => !scope || i.collectionIds.includes(scope));

  $("results-heading").textContent = searching ? "Search results" : selected ? selected.name : "All items";
  $("result-count").textContent = searching || selected ? plural(items.length, searching ? "result" : "item") : "";

  const empty = searching
    ? `No matches for “${state.query.trim()}”. Try fewer words, or remove filters such as tag: or site:.`
    : selected
      ? "This collection is empty. Save something from a page, or add an existing item to it."
      : "Nothing saved yet. Open PagePocket from the toolbar on any page to save the page, a selection, or a code block.";
  $("items").replaceChildren(
    ...(items.length ? items.map((i) => renderItem(ctx, i, notesFor(allNotes, "item", i.id))) : [h("p", { class: "empty" }, empty)]),
  );

  restoreUi(snapshot, "results-heading");
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
const queryInput = $<HTMLInputElement>("query");

function setQuery(value: string): void {
  state.query = value;
  queryInput.value = value;
  void render();
}

queryInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = queryInput.value; void render(); }, 120);
});
queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && queryInput.value) {
    event.preventDefault();
    setQuery("");
  }
});
$("search").addEventListener("submit", (event) => event.preventDefault());

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  const typing = target.matches("input, textarea, select") || target.isContentEditable;
  if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    queryInput.focus();
    queryInput.select();
  }
});

$<HTMLFormElement>("new-collection").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $<HTMLInputElement>("new-name");
  void guarded(async () => {
    const created = await library.createCollection(input.value);
    input.value = "";
    state.view = created.id;
    say(`Created collection ${created.name}.`);
    await render();
  });
});

$("rename-btn").addEventListener("click", () => void guarded(async () => {
  const renamed = await library.renameCollection(state.view, $<HTMLInputElement>("rename").value);
  say(`Renamed to ${renamed.name}.`);
  await render();
}));

$("delete-btn").addEventListener("click", () => void guarded(async () => {
  const name = (await library.listCollections()).find((c) => c.id === state.view)?.name ?? "this collection";
  const kept = plural((await library.listItems({ collectionId: state.view })).length, "item");
  if (!confirm(`Delete the collection “${name}”? Its ${kept} stay in your library.`)) return;
  await library.deleteCollection(state.view);
  state.view = ALL;
  say(`Deleted collection ${name}.`);
  await render();
  $("results-heading").focus();
}));

library.onExternalChange(() => void render());

initDataTools({
  library,
  currentCollection: () => (state.view === ALL ? undefined : state.view),
  refresh: render,
});

void render();
