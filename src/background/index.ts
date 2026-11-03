import { openLibrary } from "../library/default";
import type { BackgroundRequest } from "../shared/messages";
import { loadSettings } from "../storage/settings";
import { activeTabId, captureRectangularSnip, captureScreenshot, captureTab, composeSnipCollage, type RectangularSnip } from "./capture";
import { saveSelectionFromMenu } from "./save-selection";
import { api } from "../shared/api";

const MENU_SAVE_SELECTION = "save-selection";

api.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  if (message?.type !== "capture-page" && message?.type !== "capture-screenshot" && message?.type !== "save-snip") return false;
  void (async () => {
    const tabId = await activeTabId();
    sendResponse(
      tabId === undefined
        ? { ok: false, error: { code: "no-active-tab", message: "No active tab." } }
        : message.type === "capture-screenshot" ? await captureScreenshot(tabId)
          : message.type === "save-snip" ? await saveSnip(tabId, message.collectionId, message.tags, message.note)
          : await captureTab(tabId),
    );
  })();
  // Returning a promise from onMessage is not reliable across Chrome versions;
  // sendResponse plus `return true` works in both Chrome and Firefox.
  return true;
});

async function saveSnip(tabId: number, collectionId?: string, tags: string[] = [], note?: string) {
  const snips: RectangularSnip[] = [];
  while (snips.length < 20) {
    const result = await captureRectangularSnip(tabId);
    if (!result.ok) {
      if (result.error.code === "capture-cancelled" && snips.length > 0) {
        break;
      }
      return result;
    }
    snips.push(result.data);
  }
  try {
    const collage = await composeSnipCollage(snips.map((snip) => snip.screenshot.dataUrl));
    const saved = await openLibrary().saveScreenshot(snips[0]!.capture, collage, collectionId, tags, note);
    await api.tabs.create({
      url: api.runtime.getURL(`snip-review.html?id=${encodeURIComponent(saved.item.id)}`),
      active: true,
    });
    return { ok: true as const, data: { created: saved.created, count: snips.length, itemId: saved.item.id } };
  } catch {
    return { ok: false as const, error: { code: "screenshot-failed" as const, message: "This browser could not compose the snip collage." } };
  }
}

api.runtime.onInstalled.addListener(async () => {
  await api.contextMenus.removeAll();
  api.contextMenus.create({
    id: MENU_SAVE_SELECTION,
    title: "Save selection to ContextLens",
    contexts: ["selection"],
  });
});

// Tab-scoped badges clear on navigation, so no timer is needed in a service
// worker that may be suspended.
api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_SAVE_SELECTION || tab?.id === undefined) return;
  const tabId = tab.id;
  saveSelectionFromMenu({ capture: captureTab, library: openLibrary(), loadSettings }, tabId, info.selectionText)
    .then(() => api.action.setBadgeText({ tabId, text: "OK" }))
    .catch(() => api.action.setBadgeText({ tabId, text: "!" }));
});
