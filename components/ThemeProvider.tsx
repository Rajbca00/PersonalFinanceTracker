"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "blue" | "green" | "purple" | "teal";

interface ThemeCtx {
  mode: ThemeMode;
  accent: Accent;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: Accent) => void;
}

const Ctx = createContext<ThemeCtx>({
  mode: "system",
  accent: "blue",
  setMode: () => {},
  setAccent: () => {},
});

export const useTheme = () => useContext(Ctx);

export const THEME_KEY = "pft-theme";
export const ACCENT_KEY = "pft-accent";

/**
 * Runs before first paint so the page never flashes the wrong theme.
 * Kept in sync with the provider below by hand — it is deliberately tiny.
 */
export const themeScript = `
(function(){
  try {
    var m = localStorage.getItem("${THEME_KEY}") || "system";
    var a = localStorage.getItem("${ACCENT_KEY}") || "blue";
    var dark = m === "dark" || (m === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    var r = document.documentElement;
    r.setAttribute("data-theme", dark ? "dark" : "light");
    r.setAttribute("data-accent", a);
    r.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();
`;

function apply(mode: ThemeMode, accent: Accent) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-accent", accent);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [accent, setAccentState] = useState<Accent>("blue");

  // Adopt whatever the pre-paint script already decided.
  useEffect(() => {
    const m = (localStorage.getItem(THEME_KEY) as ThemeMode) || "system";
    const a = (localStorage.getItem(ACCENT_KEY) as Accent) || "blue";
    setModeState(m);
    setAccentState(a);
  }, []);

  // In "system" mode, follow the OS while the app is open.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system", accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, accent]);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      try {
        localStorage.setItem(THEME_KEY, m);
      } catch {}
      apply(m, accent);
    },
    [accent]
  );

  const setAccent = useCallback(
    (a: Accent) => {
      setAccentState(a);
      try {
        localStorage.setItem(ACCENT_KEY, a);
      } catch {}
      apply(mode, a);
    },
    [mode]
  );

  return <Ctx.Provider value={{ mode, accent, setMode, setAccent }}>{children}</Ctx.Provider>;
}
