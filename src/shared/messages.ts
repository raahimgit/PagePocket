import type { PageCapture, ScreenshotCapture } from "./types";

export type ErrorCode = "restricted-page" | "no-active-tab" | "extraction-failed" | "capture-cancelled" | "screenshot-failed";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export type BackgroundRequest =
  | { type: "capture-page" }
  | { type: "capture-screenshot" }
  | { type: "save-snip"; collectionId?: string; tags?: string[]; note?: string };
export type CaptureScreenshotResult = Result<ScreenshotCapture>;

export type Region = { x: number; y: number; width: number; height: number; devicePixelRatio: number };
export type ContentRequest = { type: "extract" } | { type: "select-region" };
