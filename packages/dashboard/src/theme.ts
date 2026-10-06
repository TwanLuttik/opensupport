import { useEffect, useState } from "react";
import type { ThemeName } from "./types.js";

export interface ThemeController {
  theme: ThemeName;
  dark: boolean;
  cycle: () => void;
}

const ORDER: ThemeName[] = ["system", "light", "dark"];

export function readTheme(): ThemeName {
  const stored = localStorage.getItem("osb_theme");
  return stored === "dark" || stored === "light" ? stored : "system";
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function isDark(theme: ThemeName): boolean {
  return theme === "dark" || (theme !== "light" && systemDark());
}

export function applyTheme(theme: ThemeName): void {
  const dark = isDark(theme);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function useTheme(): ThemeController {
  const [theme, setTheme] = useState<ThemeName>(() => readTheme());
  const [system, setSystem] = useState(systemDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, system]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    if (next === "system") localStorage.removeItem("osb_theme");
    else localStorage.setItem("osb_theme", next);
    setTheme(next);
  }

  return { theme, dark: theme === "dark" || (theme !== "light" && system), cycle };
}

export function themeLabel(theme: ThemeName): string {
  return theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";
}
