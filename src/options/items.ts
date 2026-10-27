import type { Library } from "../library/library";
import { parseTagInput } from "../library/tags";
import { highlight } from "../search";
import { h, safeHref } from "../shared/dom";
import { formatDate } from "../shared/format";
import type { Collection, Item, Note, NoteTarget } from "../shared/types";
import { focusAfterRender, guarded, keyed, say } from "./ui";

export interface ItemContext {
  library: Library;
  query: string;
  collections: Collection[];
  editing: { noteId?: string };
  refresh: () => Promise<void>;
}

const TYPE_LABEL: Record<Item["type"], string> = {
  page: "Page", excerpt: "Excerpt", code: "Code", heading: "Heading", link: "Link", screenshot: "Screenshot",
};

function marked(ctx: ItemContext, text: string): (Node | string)[] {
  if (!ctx.query.trim()) return [text];
  return highlight(text, ctx.query).map((seg) => (seg.hit ? h("mark", {}, seg.text) : seg.text));
}

function externalLink(url: string, label: string): HTMLElement | string {
  const href = safeHref(url);
  return href
    ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, label, h("span", { class: "sr-only" }, " (opens in a new tab)"))
    : label;
}

function itemBody(ctx: ItemContext, item: Item): HTMLElement | string {
  if (!item.content) return "";
  if (item.type === "code") return h("pre", { tabindex: "0", "aria-label": "Code" }, ...marked(ctx, item.content));
  if (item.type === "excerpt") return h("blockquote", {}, ...marked(ctx, item.content));
  if (item.type === "screenshot") return h("img", { src: item.content, alt: `Screenshot captured from ${item.source.pageTitle || item.source.url}`, loading: "lazy" });
  return h("p", {}, ...marked(ctx, item.content));
}

function group(label: string, ...children: (Node | string)[]): HTMLElement {
  return h("div", { class: "group", role: "group", "aria-label": label }, h("p", { class: "group-label" }, label), ...children);
}

export function renderNotes(ctx: ItemContext, target: NoteTarget, notes: Note[], keyBase: string, subject: string): HTMLElement {
  const field = keyed(
    h("textarea", { rows: "2", maxlength: "10000", "aria-label": `New note on ${subject}` }),
    `${keyBase}:note-input`,
  );
  const add = () => guarded(async () => {
    await ctx.library.addNote(target, field.value);
    field.value = "";
    say("Note added.");
    await ctx.refresh();
  });
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void add();
    }
  });

  const renderNote = (note: Note): HTMLElement => {
    const preview = note.body.slice(0, 30);
    if (ctx.editing.noteId === note.id) {
      const edit = keyed(h("textarea", { rows: "3", maxlength: "10000", "aria-label": "Edit note" }), `note:${note.id}:edit`);
      edit.value = note.body;
      const save = () => guarded(async () => {
        await ctx.library.updateNote(note.id, edit.value);
        ctx.editing.noteId = undefined;
        focusAfterRender(`note:${note.id}:edit-btn`);
        say("Note saved.");
        await ctx.refresh();
      });
      edit.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void save();
        } else if (event.key === "Escape") {
          ctx.editing.noteId = undefined;
          focusAfterRender(`note:${note.id}:edit-btn`);
          void ctx.refresh();
        }
      });
      return h("li", {}, edit, h("div", { class: "row" },
        keyed(h("button", { type: "button", onclick: () => void save() }, "Save note"), `note:${note.id}:save`),
        keyed(h("button", { type: "button", onclick: () => { ctx.editing.noteId = undefined; focusAfterRender(`note:${note.id}:edit-btn`); void ctx.refresh(); } }, "Cancel"), `note:${note.id}:cancel`)));
    }
    return h("li", {}, h("p", {}, ...marked(ctx, note.body)), h("div", { class: "row" },
      keyed(h("button", { type: "button", "aria-label": `Edit note: ${preview}`, onclick: () => { ctx.editing.noteId = note.id; focusAfterRender(`note:${note.id}:edit`); void ctx.refresh(); } }, "Edit"), `note:${note.id}:edit-btn`),
      keyed(h("button", { type: "button", "aria-label": `Delete note: ${preview}`, onclick: () => void guarded(async () => { await ctx.library.deleteNote(note.id); say("Note deleted."); focusAfterRender(`${keyBase}:note-input`); await ctx.refresh(); }) }, "Delete"), `note:${note.id}:delete`)));
  };

  return h("div", { class: "notes-block" },
    notes.length ? h("ul", { class: "notes" }, ...notes.map(renderNote)) : "",
    h("div", { class: "row" }, field,
      keyed(h("button", { type: "button", "aria-label": `Add note to ${subject}`, onclick: () => void add() }, "Add note"), `${keyBase}:note-add`)));
}

export function renderItem(ctx: ItemContext, item: Item, notes: Note[]): HTMLElement {
  const title = item.source.pageTitle || item.source.url;
  const key = `item:${item.id}`;
  const names = new Map(ctx.collections.map((c) => [c.id, c.name]));

  const tagField = keyed(h("input", { "aria-label": `Add tags to ${title}`, placeholder: "Add tags", autocomplete: "off" }), `${key}:tag-input`);
  const addTags = () => guarded(async () => {
    const tags = parseTagInput(tagField.value);
    if (!tags.length) return;
    await ctx.library.addTags(item.id, tags);
    tagField.value = "";
    say("Tags added.");
    await ctx.refresh();
  });
  tagField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void addTags();
    }
  });

  const available = ctx.collections.filter((c) => !item.collectionIds.includes(c.id));
  const picker = keyed(h("select", { "aria-label": `Collection to add ${title} to` }, ...available.map((c) => h("option", { value: c.id }, c.name))), `${key}:collection-select`);

  const meta = h("p", { class: "meta muted" },
    h("span", { class: "badge" }, TYPE_LABEL[item.type]),
    item.language ? `${item.language} · ` : "",
    "captured ", h("time", { datetime: item.capturedAt }, formatDate(item.capturedAt)),
    item.headingContext ? ` · under “${item.headingContext}”` : "");

  return h("article", { "aria-label": title },
    h("h3", {}, ...marked(ctx, title)),
    meta,
    h("p", { class: "meta" }, "Source: ", externalLink(item.source.url, item.source.url)),
    item.targetUrl ? h("p", { class: "meta" }, "Target: ", externalLink(item.targetUrl, item.targetUrl)) : "",
    itemBody(ctx, item),

    group("Tags",
      item.tags.length
        ? h("ul", { class: "chips" }, ...item.tags.map((tag) => h("li", {},
            keyed(h("button", { type: "button", "aria-label": `Remove tag ${tag}`, onclick: () => void guarded(async () => { await ctx.library.removeTag(item.id, tag); say(`Removed tag ${tag}.`); focusAfterRender(`${key}:tag-input`); await ctx.refresh(); }) }, `${tag} ×`), `${key}:tag:${tag}`))))
        : "",
      h("div", { class: "row" }, tagField, keyed(h("button", { type: "button", "aria-label": `Add tags to ${title}`, onclick: () => void addTags() }, "Add tags"), `${key}:tag-add`))),

    group("Collections",
      item.collectionIds.length
        ? h("ul", { class: "chips" }, ...item.collectionIds.map((id) => h("li", {},
            keyed(h("button", { type: "button", "aria-label": `Remove from collection ${names.get(id) ?? id}`, onclick: () => void guarded(async () => { await ctx.library.removeFromCollection(item.id, id); say(`Removed from ${names.get(id) ?? "collection"}.`); focusAfterRender(`${key}:collection-select`); await ctx.refresh(); }) }, `${names.get(id) ?? id} ×`), `${key}:collection:${id}`))))
        : h("p", { class: "meta muted" }, "Not in any collection."),
      available.length
        ? h("div", { class: "row" }, picker,
            keyed(h("button", { type: "button", "aria-label": `Add ${title} to the selected collection`, onclick: () => void guarded(async () => { await ctx.library.addToCollection(item.id, picker.value); say(`Added to ${names.get(picker.value) ?? "collection"}.`); await ctx.refresh(); }) }, "Add to collection"), `${key}:collection-add`))
        : ""),

    group("Notes", renderNotes(ctx, { kind: "item", id: item.id }, notes, key, title)),

    h("div", { class: "actions" },
      keyed(h("button", { type: "button", "aria-label": `Delete ${title}`, onclick: () => void guarded(async () => {
        if (!confirm(`Delete “${title.slice(0, 80)}” and its notes? This cannot be undone.`)) return;
        await ctx.library.deleteItem(item.id);
        say("Item deleted.");
        await ctx.refresh();
      }) }, "Delete item"), `${key}:delete`)),
  );
}
