import { afterEach, describe, expect, it, vi } from "vitest";

import { applyTheme } from "./theme";

function prefersDark(dark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: dark, media: query }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("applyTheme", () => {
  it("uses the chosen theme whatever the system prefers", () => {
    prefersDark(true);
    applyTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
    applyTheme("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("follows the system for the system theme", () => {
    prefersDark(true);
    applyTheme("system");
    expect(document.documentElement).toHaveClass("dark");
    prefersDark(false);
    applyTheme("system");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("remembers the setting for the next visit's first paint", () => {
    applyTheme("dark");
    expect(localStorage.getItem("aide-theme")).toBe("dark");
  });
});
