import { IdbRepository } from "../storage/idb";
import { Library } from "./library";

let instance: Library | undefined;

// Popup, options and background are separate JS contexts sharing one database;
// the channel tells the others to drop their cached search index.
export function openLibrary(): Library {
  if (!instance) {
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("contextlens") : undefined;
    const library = new Library(new IdbRepository(), { onChange: () => channel?.postMessage("changed") });
    channel?.addEventListener("message", () => library.invalidate());
    instance = library;
  }
  return instance;
}
