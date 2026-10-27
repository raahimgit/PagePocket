import type { Region, Result } from "../shared/messages";
import type { PageCapture, ScreenshotCapture } from "../shared/types";
import { api } from "../shared/api";

export async function activeTabId(): Promise<number | undefined> {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export async function captureTab(tabId: number): Promise<Result<PageCapture>> {
  try {
    await api.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    // Thrown for chrome://, the web stores, PDF viewers and other pages where
    // injection is not permitted. Not an extension bug.
    return {
      ok: false,
      error: { code: "restricted-page", message: "This page cannot be captured by extensions." },
    };
  }

  try {
    return await api.tabs.sendMessage(tabId, { type: "extract" });
  } catch {
    return { ok: false, error: { code: "extraction-failed", message: "Extraction failed." } };
  }
}

export async function captureScreenshot(tabId: number): Promise<Result<ScreenshotCapture>> {
  const page = await captureTab(tabId);
  if (!page.ok) return page;
  try {
    const dataUrl = await api.tabs.captureVisibleTab({ format: "png" });
    return { ok: true, data: { source: page.data.source, dataUrl, warnings: page.data.warnings } };
  } catch {
    return { ok: false, error: { code: "restricted-page", message: "This page cannot be screenshotted by the browser." } };
  }
}

export interface RectangularSnip { capture: PageCapture; screenshot: ScreenshotCapture }

async function cropPng(dataUrl: string, region: Region): Promise<string> {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") throw new Error("Cropping is not supported by this browser.");
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid screenshot data.");
  const encoded = atob(dataUrl.slice(comma + 1));
  const encodedBytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) encodedBytes[i] = encoded.charCodeAt(i);
  const image = await createImageBitmap(new Blob([encodedBytes], { type: "image/png" }));
  const scale = region.devicePixelRatio;
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(region.width * scale)), Math.max(1, Math.round(region.height * scale)));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create screenshot canvas.");
  context.drawImage(image, Math.round(region.x * scale), Math.round(region.y * scale), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  image.close();
  const outputBytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  let binary = "";
  for (let i = 0; i < outputBytes.length; i += 0x8000) binary += String.fromCharCode(...outputBytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

async function imageFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid screenshot data.");
  const encoded = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: "image/png" }));
}

async function pngDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

/** Compose a snip session into one tidy two-column collage item. */
export async function composeSnipCollage(dataUrls: string[]): Promise<string> {
  if (dataUrls.length === 0) throw new Error("No snips to compose.");
  if (dataUrls.length === 1) return dataUrls[0]!;
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") throw new Error("Collage composition is not supported by this browser.");
  const images = await Promise.all(dataUrls.map(imageFromDataUrl));
  const cellWidth = 800;
  const gap = 16;
  const columns = Math.min(2, images.length);
  const cards = images.map((image) => {
    const scale = Math.min(1, cellWidth / image.width, 1000 / image.height);
    return { image, width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) };
  });
  const rows = Math.ceil(cards.length / columns);
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...cards.slice(row * columns, (row + 1) * columns).map((card) => card.height)));
  const canvas = new OffscreenCanvas(columns * cellWidth + (columns - 1) * gap, rowHeights.reduce((sum, height) => sum + height, 0) + (rows - 1) * gap);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create collage canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  cards.forEach((card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * (cellWidth + gap) + Math.round((cellWidth - card.width) / 2);
    const rowOffset = rowHeights.slice(0, row).reduce((sum, height) => sum + height + gap, 0);
    context.drawImage(card.image, x, rowOffset + Math.round((rowHeights[row]! - card.height) / 2), card.width, card.height);
    card.image.close();
  });
  return pngDataUrl(canvas);
}

export async function captureRectangularSnip(tabId: number): Promise<Result<RectangularSnip>> {
  const page = await captureTab(tabId);
  if (!page.ok) return page;
  let region: Result<Region>;
  try { region = await api.tabs.sendMessage(tabId, { type: "select-region" }) as Result<Region>; }
  catch { return { ok: false, error: { code: "capture-cancelled", message: "Snip cancelled." } }; }
  if (!region.ok) return region;
  try {
    const full = await api.tabs.captureVisibleTab({ format: "png" });
    const dataUrl = await cropPng(full, region.data);
    return { ok: true, data: { capture: page.data, screenshot: { source: page.data.source, dataUrl, bounds: region.data, warnings: page.data.warnings } } };
  } catch {
    return { ok: false, error: { code: "screenshot-failed", message: "This browser could not crop the selected area." } };
  }
}
