import { friendlyError } from "../library/errors";

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let announcements = 0;

// The live region only announces changes, so alternate a trailing nbsp to make
// two identical messages in a row still register.
export function say(message: string, isError = false): void {
  const el = $("status");
  el.textContent = message ? message + (announcements++ % 2 ? "\u00a0" : "") : "";
  el.classList.toggle("error", isError);
}

export async function guarded(action: () => Promise<void>): Promise<void> {
  say("");
  try {
    await action();
  } catch (error) {
    say(friendlyError(error), true);
  }
}

export function keyed<T extends HTMLElement>(el: T, key: string): T {
  el.dataset.key = key;
  return el;
}

// Re-rendering replaces the DOM, which would drop keyboard focus and any text
// typed into fields that have not been submitted. Elements opt in with `keyed`.
export interface UiSnapshot {
  focus: string | undefined;
  drafts: Map<string, string>;
}

let requestedFocus: string | undefined;

export function focusAfterRender(key: string): void {
  requestedFocus = key;
}

export function snapshotUi(): UiSnapshot {
  const drafts = new Map<string, string>();
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea[data-key], input[data-key]").forEach((el) => {
    if (el.value !== "") drafts.set(el.dataset.key!, el.value);
  });
  return { focus: (document.activeElement as HTMLElement | null)?.dataset?.key, drafts };
}

const byKey = (key: string) => document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);

export function restoreUi(snapshot: UiSnapshot, fallbackId: string): void {
  for (const [key, value] of snapshot.drafts) {
    const el = byKey(key) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el && el.value === "") el.value = value;
  }
  const wanted = requestedFocus ?? snapshot.focus;
  requestedFocus = undefined;
  if (wanted === undefined) return;
  (byKey(wanted) ?? $(fallbackId)).focus();
}
