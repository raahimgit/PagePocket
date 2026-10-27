import type { Library } from "../library/library";
import type { Result } from "../shared/messages";
import type { PageCapture } from "../shared/types";
import type { Settings } from "../storage/settings";

export interface SaveSelectionDeps {
  capture: (tabId: number) => Promise<Result<PageCapture>>;
  library: Pick<Library, "listCollections" | "save">;
  loadSettings: () => Promise<Settings>;
}

export async function saveSelectionFromMenu(
  deps: SaveSelectionDeps,
  tabId: number,
  fallbackText: string | undefined,
): Promise<void> {
  const captured = await deps.capture(tabId);
  if (!captured.ok) throw new Error(captured.error.message);

  // The selection can live in an iframe the content script cannot see; the
  // menu event still carries its text, just without heading context.
  const selection = captured.data.selection ?? (fallbackText?.trim() ? { text: fallbackText.trim() } : null);
  if (!selection) throw new Error("Nothing is selected.");

  const { lastCollectionId } = await deps.loadSettings();
  const collections = await deps.library.listCollections();
  const collectionId = collections.some((c) => c.id === lastCollectionId) ? lastCollectionId : undefined;
  await deps.library.save({ ...captured.data, selection }, { kind: "selection" }, collectionId);
}
