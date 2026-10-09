import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { setBaseStatusBarColor } from "@hc/shared";

/**
 * Thème de l'application client : clair, sombre ou automatique (préférence du
 * téléphone). Les couleurs elles-mêmes sont centralisées dans des jetons CSS
 * (theme.css + index.css) pilotés par l'attribut data-theme de <html> : aucun
 * composant ne choisit sa couleur selon le thème.
 *
 * La préférence est conservée sur l'appareil (localStorage) ; le script en tête
 * d'index.html l'applique avant le premier affichage pour éviter tout flash.
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "hc-theme";
const META_COLORS: Record<ResolvedTheme, string> = { light: "#FFFFFF", dark: "#0B0908" };
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  // Mode automatique : suit les changements du téléphone en direct
  useEffect(() => {
    const query = darkQuery();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    setBaseStatusBarColor(META_COLORS[resolved]);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // stockage indisponible (navigation privée) : le choix vaut pour cette visite
    }
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme hors de ThemeProvider");
  return ctx;
}
