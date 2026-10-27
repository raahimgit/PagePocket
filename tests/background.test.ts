import { beforeEach, describe, expect, it } from "vitest";
import { activeTabId, captureTab } from "../src/background/capture";
import { saveSelectionFromMenu, type SaveSelectionDeps } from "../src/background/save-selection";
import { registerContentScript, type ContentWorld } from "../src/content/register";
import { loadSettings, saveSettings } from "../src/storage/settings";
import type { PageCapture } from "../src/shared/types";
import { installApi } from "./chrome-stub";

const capture = (selection: PageCapture["selection"]): PageCapture => ({
  source: { url: "https://example.com/a", pageTitle: "A" }, metadata: {}, headings: [], links: [], codeBlocks: [], selection, warnings: [],
});

describe("captureTab and activeTab restrictions", () => {
  it("reports a restricted page when injection is refused, without throwing", async () => {
    installApi({ executeScript: async () => { throw new Error("Cannot access a chrome:// URL"); } });
    const result = await captureTab(7);
    expect(result).toMatchObject({ ok: false, error: { code: "restricted-page" } });
  });

  it("injects only into the requested tab, and only the content bundle", async () => {
    const { calls } = installApi({ sendMessage: async () => ({ ok: true, data: capture(null) }) });
    await captureTab(42);
    expect(calls.executeScript).toEqual([[{ target: { tabId: 42 }, files: ["content.js"] }]]);
    expect(calls.sendMessage).toEqual([[42, { type: "extract" }]]);
  });

  it("reports extraction failure when the content script does not answer", async () => {
    installApi({ sendMessage: async () => { throw new Error("Receiving end does not exist"); } });
    expect(await captureTab(7)).toMatchObject({ ok: false, error: { code: "extraction-failed" } });
  });

  it("passes a successful capture through unchanged", async () => {
    const data = capture({ text: "hi" });
    installApi({ sendMessage: async () => ({ ok: true, data }) });
    expect(await captureTab(7)).toEqual({ ok: true, data });
  });

  it("finds the active tab id, or none", async () => {
    installApi();
    expect(await activeTabId()).toBe(7);
    installApi({ query: async () => [] });
    expect(await activeTabId()).toBeUndefined();
  });
});

describe("context-menu save", () => {
  let saved: any[];
  let deps: SaveSelectionDeps;
  const make = (result: Awaited<ReturnType<SaveSelectionDeps["capture"]>>, last?: string): SaveSelectionDeps => ({
    capture: async () => result,
    loadSettings: async () => ({ lastCollectionId: last }),
    library: {
      listCollections: async () => [{ id: "c1", name: "A", createdAt: "t", updatedAt: "t" }],
      save: async (...args: any[]) => { saved.push(args); return { item: {} as any, created: true }; },
    },
  });
  beforeEach(() => { saved = []; });

  it("saves the extracted selection into the remembered collection", async () => {
    deps = make({ ok: true, data: capture({ text: "extracted", headingContext: "H" }) }, "c1");
    await saveSelectionFromMenu(deps, 7, "menu text");
    expect(saved[0][0].selection).toEqual({ text: "extracted", headingContext: "H" });
    expect(saved[0][2]).toBe("c1");
  });

  it("falls back to the menu's text when the page selection is unreachable (iframe)", async () => {
    deps = make({ ok: true, data: capture(null) });
    await saveSelectionFromMenu(deps, 7, "  from the menu  ");
    expect(saved[0][0].selection).toEqual({ text: "from the menu" });
  });

  it("ignores a remembered collection that no longer exists", async () => {
    deps = make({ ok: true, data: capture({ text: "x" }) }, "deleted");
    await saveSelectionFromMenu(deps, 7, undefined);
    expect(saved[0][2]).toBeUndefined();
  });

  it("fails when there is nothing to save, or the page is restricted", async () => {
    await expect(saveSelectionFromMenu(make({ ok: true, data: capture(null) }), 7, "   ")).rejects.toBeInstanceOf(Error);
    await expect(saveSelectionFromMenu(make({ ok: false, error: { code: "restricted-page", message: "nope" } }), 7, "x")).rejects.toBeInstanceOf(Error);
    expect(saved).toEqual([]);
  });
});

describe("settings storage", () => {
  it("round-trips and merges", async () => {
    installApi();
    expect(await loadSettings()).toEqual({});
    await saveSettings({ lastCollectionId: "c1", theme: "dark" });
    expect(await loadSettings()).toEqual({ lastCollectionId: "c1", theme: "dark" });
  });

  it("ignores malformed stored values", async () => {
    const { store } = installApi();
    store.set("settings", { lastCollectionId: 42, theme: "sepia" });
    expect(await loadSettings()).toEqual({});
    store.set("settings", "garbage");
    expect(await loadSettings()).toEqual({});
  });
});

describe("content script registration", () => {
  const messages = (world: ContentWorld, extract: () => PageCapture) => {
    const listeners: any[] = [];
    registerContentScript(world, (l) => listeners.push(l), extract);
    return listeners;
  };

  it("registers once per world, however many times it is injected", () => {
    const world: ContentWorld = {};
    const extract = () => capture(null);
    expect(messages(world, extract)).toHaveLength(1);
    expect(messages(world, extract)).toHaveLength(0);
    expect(messages(world, extract)).toHaveLength(0);
  });

  it("answers extract requests and ignores everything else", () => {
    const [listener] = messages({}, () => capture({ text: "s" }));
    let response: any;
    expect(listener({ type: "extract" }, null, (r: any) => { response = r; })).toBe(false);
    expect(response).toMatchObject({ ok: true, data: { selection: { text: "s" } } });

    response = undefined;
    listener({ type: "other" }, null, (r: any) => { response = r; });
    listener(undefined, null, (r: any) => { response = r; });
    expect(response).toBeUndefined();
  });

  it("answers with an error instead of staying silent when extraction throws", () => {
    const [listener] = messages({}, () => { throw new Error("hostile page"); });
    let response: any;
    listener({ type: "extract" }, null, (r: any) => { response = r; });
    expect(response).toEqual({ ok: false, error: { code: "extraction-failed", message: "Extraction failed." } });
  });
});
