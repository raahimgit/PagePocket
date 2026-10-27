import { loadSettings, saveSettings } from "../storage/settings";

export type Theme = "light" | "dark";

export async function applySavedTheme(): Promise<Theme> {
  const saved = (await loadSettings()).theme;
  const theme = saved ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  return theme;
}

export async function toggleTheme(): Promise<Theme> {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const theme: Theme = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  await saveSettings({ theme });
  return theme;
}

export function updateThemeButton(button: HTMLButtonElement, theme: Theme): void {
  button.textContent = theme === "dark" ? "Use light theme" : "Use dark theme";
  button.setAttribute("aria-pressed", String(theme === "dark"));
}
