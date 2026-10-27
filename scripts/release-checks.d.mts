export const REQUIRED_FILES: string[];
export function checkFileSet(files: string[]): string[];
export function checkManifest(manifest: Record<string, any>, options: { version: string; target: "chrome" | "firefox" }): string[];
