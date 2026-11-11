import type { Library, ImportMode, ImportStats } from "../library/library";
import { LIMITS, parseBundle } from "../portability/validate";
import { h } from "../shared/dom";
import { downloadText } from "../shared/download";
import { plural } from "../shared/format";
import type { ExportBundle } from "../shared/types";
import { $, guarded, say } from "./ui";

export interface DataToolsDeps {
  library: Library;
  currentCollection: () => string | undefined;
  refresh: () => Promise<void>;
}

export function initDataTools(deps: DataToolsDeps): void {
  const today = () => new Date().toISOString().slice(0, 10);

  $("export-json").addEventListener("click", () => void guarded(async () => {
    const bundle = await deps.library.exportBundle();
    downloadText(`pagepocket-backup-${today()}.json`, JSON.stringify(bundle, null, 2), "application/json");
    say(`Exported ${plural(bundle.items.length, "item")}, ${plural(bundle.notes.length, "note")} and ${plural(bundle.collections.length, "collection")}.`);
  }));

  $("export-md").addEventListener("click", () => void guarded(async () => {
    const { text, filename } = await deps.library.exportMarkdown(deps.currentCollection());
    downloadText(filename, text, "text/markdown");
  }));

  let pending: { bundle: ExportBundle; warnings: string[] } | undefined;
  const panel = $("import-panel");
  const fileInput = $<HTMLInputElement>("import-file");
  const chosenMode = (): ImportMode =>
    (document.querySelector<HTMLInputElement>('input[name="import-mode"]:checked')?.value as ImportMode | undefined) ?? "merge";

  function closeImport(): void {
    pending = undefined;
    panel.hidden = true;
    fileInput.value = "";
  }

  function summarize(stats: ImportStats, warnings: string[]): HTMLElement {
    const line = (label: string, parts: string[]) => h("li", {}, `${label}: ${parts.join(", ")}`);
    const items = stats.items;
    return h("div", {},
      h("ul", {},
        line("Items", [`${items.added} new`, `${items.merged} merged into existing`, `${items.skipped} already present`]),
        line("Collections", [`${stats.collections.added} new`, `${stats.collections.merged} matched by name`, `${stats.collections.skipped} already present`]),
        line("Notes", [`${stats.notes.added} new`, `${stats.notes.skipped} skipped`]),
        stats.mode === "replace"
          ? h("li", {}, h("strong", {}, `This deletes ${plural(stats.deleted.items, "item")}, ${plural(stats.deleted.notes, "note")} and ${plural(stats.deleted.collections, "collection")} first.`))
          : "",
      ),
      ...warnings.map((w) => h("p", { class: "meta muted" }, `Note: ${w}`)),
    );
  }

  async function refreshPreview(): Promise<void> {
    if (!pending) return;
    const stats = await deps.library.previewImport(pending.bundle, chosenMode());
    $("import-summary").replaceChildren(summarize(stats, pending.warnings));
  }

  fileInput.addEventListener("change", () => void guarded(async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    panel.hidden = false;
    $("data-tools").setAttribute("open", "");
    $("import-problems").replaceChildren();
    $("import-summary").replaceChildren();
    pending = undefined;
    $<HTMLButtonElement>("import-confirm").disabled = true;

    if (file.size > LIMITS.fileChars) {
      $("import-problems").replaceChildren(h("p", { class: "error" }, "That file is too large to import."));
      return;
    }
    const parsed = parseBundle(await file.text());
    if (!parsed.ok) {
      $("import-problems").replaceChildren(
        h("p", { class: "error" }, "This file was not imported because it did not pass validation:"),
        h("ul", {}, ...parsed.errors.map((e) => h("li", {}, e))),
      );
      return;
    }
    pending = { bundle: parsed.bundle, warnings: parsed.warnings };
    $<HTMLButtonElement>("import-confirm").disabled = false;
    await refreshPreview();
    $("import-heading").focus();
  }));

  $("import-modes").addEventListener("change", () => void guarded(refreshPreview));
  $("import-cancel").addEventListener("click", closeImport);

  $("import-confirm").addEventListener("click", () => void guarded(async () => {
    if (!pending) return;
    const mode = chosenMode();
    if (mode === "replace") {
      const stats = await deps.library.previewImport(pending.bundle, mode);
      const { items, notes, collections } = stats.deleted;
      if (!confirm(`Replace everything? This permanently deletes ${plural(items, "item")}, ${plural(notes, "note")} and ${plural(collections, "collection")} currently stored. Export a backup first if you are unsure.`)) return;
    }
    const stats = await deps.library.importBundle(pending.bundle, mode);
    closeImport();
    await deps.refresh();
    say(`Imported ${plural(stats.items.added, "new item")} (${stats.items.merged} merged), ${plural(stats.notes.added, "note")} and ${plural(stats.collections.added, "collection")}.`);
  }));
}
