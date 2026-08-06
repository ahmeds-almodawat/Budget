export const THEME_STORAGE_KEY = "almodawat-theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

export function applyResolvedTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
}

/**
 * Blocking inline script: runs before paint to avoid theme flash.
 * Reads localStorage preference; falls back to system.
 */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=localStorage.getItem(k);if(p!=="light"&&p!=="dark"&&p!=="system"){p="system";}var dark=window.matchMedia("(prefers-color-scheme: dark)").matches;var r=p==="system"?(dark?"dark":"light"):p;var el=document.documentElement;if(r==="dark"){el.classList.add("dark");}else{el.classList.remove("dark");}el.setAttribute("data-theme",r);el.setAttribute("data-theme-preference",p);}catch(e){}})();`;
