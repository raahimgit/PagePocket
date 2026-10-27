import type { ContentRequest, Region, Result } from "../shared/messages";
import type { PageCapture } from "../shared/types";

export interface ContentWorld {
  __contextLensInjected?: boolean;
}

type Listener = (message: ContentRequest, sender: unknown, sendResponse: (response: Result<PageCapture> | Result<Region>) => void) => boolean;

function selectRegion(sendResponse: (response: Result<Region>) => void): void {
  const shade = document.createElement("div");
  const box = document.createElement("div");
  const hint = document.createElement("div");
  Object.assign(shade.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "crosshair", background: "rgba(0,0,0,.18)" });
  Object.assign(box.style, { position: "fixed", border: "2px solid #4f8cff", background: "rgba(79,140,255,.16)", display: "none", pointerEvents: "none" });
  Object.assign(hint.style, { position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)", padding: "6px 12px", borderRadius: "6px", color: "white", background: "rgba(0,0,0,.76)", font: "14px system-ui", pointerEvents: "none" });
  hint.textContent = "Drag to snip · Esc to finish";
  shade.append(box, hint);
  document.documentElement.append(shade);
  let startX = 0; let startY = 0; let dragging = false;
  // Wait for two paint opportunities after removing the overlay. Without this,
  // captureVisibleTab can race the compositor and include the blue selection UI.
  const finish = (response: Result<Region>) => {
    shade.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => sendResponse(response)));
  };
  const draw = (x: number, y: number) => {
    const left = Math.min(startX, x); const top = Math.min(startY, y);
    Object.assign(box.style, { display: "block", left: `${left}px`, top: `${top}px`, width: `${Math.abs(x - startX)}px`, height: `${Math.abs(y - startY)}px` });
  };
  shade.addEventListener("pointerdown", (event) => { dragging = true; startX = event.clientX; startY = event.clientY; shade.setPointerCapture(event.pointerId); draw(startX, startY); });
  shade.addEventListener("pointermove", (event) => { if (dragging) draw(event.clientX, event.clientY); });
  shade.addEventListener("pointerup", (event) => {
    if (!dragging) return; dragging = false;
    const x = Math.min(startX, event.clientX); const y = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX - startX); const height = Math.abs(event.clientY - startY);
    if (width < 2 || height < 2) { finish({ ok: false, error: { code: "capture-cancelled", message: "Select a rectangular area to snip." } }); return; }
    finish({ ok: true, data: { x, y, width, height, devicePixelRatio: window.devicePixelRatio || 1 } });
  });
  shade.addEventListener("keydown", (event) => { if (event.key === "Escape") finish({ ok: false, error: { code: "capture-cancelled", message: "Snip cancelled." } }); });
  shade.tabIndex = 0; shade.focus();
}

// Injected on demand, so repeated captures re-run the bundle in the same
// world. `globalThis` is that world's global in Chrome and the extension's
// sandbox in Firefox, where properties set on `window` are not guaranteed to
// persist between injections.
export function registerContentScript(
  world: ContentWorld,
  addListener: (listener: Listener) => void,
  extract: () => PageCapture,
): void {
  if (world.__contextLensInjected) return;
  world.__contextLensInjected = true;
  addListener((message, _sender, sendResponse) => {
    if (message?.type === "select-region") { selectRegion(sendResponse as (response: Result<Region>) => void); return true; }
    if (message?.type !== "extract") return false;
    try {
      sendResponse({ ok: true, data: extract() });
    } catch {
      sendResponse({ ok: false, error: { code: "extraction-failed", message: "Extraction failed." } });
    }
    return false;
  });
}
