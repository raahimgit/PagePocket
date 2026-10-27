export function buildManifest(target: "chrome" | "firefox", options?: { geckoId?: string }): Promise<Record<string, unknown>>;
