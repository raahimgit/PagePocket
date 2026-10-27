import { extractPage } from "../extraction";
import { api } from "../shared/api";
import { registerContentScript, type ContentWorld } from "./register";

registerContentScript(
  globalThis as ContentWorld,
  (listener) => api.runtime.onMessage.addListener(listener),
  () => extractPage(document),
);
