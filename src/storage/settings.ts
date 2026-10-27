import { api } from "../shared/api";
export interface Settings {
  lastCollectionId?: string;
  theme?: "light" | "dark";
}

const KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const stored = (await api.storage.local.get(KEY))[KEY] as { lastCollectionId?: unknown; theme?: unknown } | undefined;
  return {
    ...(typeof stored?.lastCollectionId === "string" ? { lastCollectionId: stored.lastCollectionId } : {}),
    ...(stored?.theme === "light" || stored?.theme === "dark" ? { theme: stored.theme } : {}),
  };
}

export async function saveSettings(patch: Settings): Promise<void> {
  await api.storage.local.set({ [KEY]: { ...(await loadSettings()), ...patch } });
}
