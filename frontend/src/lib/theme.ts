import { useEffect } from "react";

import type { Theme } from "./api";

const STORAGE_KEY = "aide-theme"; // read by the inline script in index.html
const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Put the page in light or dark mode for this setting. */
export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  try {
    // Only so the next visit paints the right theme before the profile loads.
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies this visit.
  }
}

/** Keep the page in step with the user's theme, and with the system for "system". */
export function useTheme(theme: Theme): void {
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => applyTheme("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [theme]);
}
