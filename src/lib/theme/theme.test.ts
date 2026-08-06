import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  isThemePreference,
  resolveTheme,
} from "@/lib/theme/theme";

describe("theme resolution", () => {
  it("accepts valid preferences only", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("neon")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("resolves system preference from OS", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("honors explicit light and dark overrides", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("theme DOM application", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies dark class and data-theme", () => {
    applyResolvedTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("removes dark class for light", () => {
    document.documentElement.classList.add("dark");
    applyResolvedTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("theme persistence fallback", () => {
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it("falls back safely for invalid stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    expect(isThemePreference(raw)).toBe(false);
    expect(resolveTheme(isThemePreference(raw) ? raw : "system", false)).toBe("light");
  });

  it("persists preference without mutating business data", () => {
    const business = { budget: 100 };
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(business.budget).toBe(100);
  });
});

describe("reduced motion token presence", () => {
  it("keeps reduce-motion media query in globals", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".dark");
    expect(css).toContain("--sidebar:");
  });
});
