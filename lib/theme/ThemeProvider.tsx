"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/** Temas aprobados — paletas en docs/04-arquitectura.md §3 */
export const THEMES = [
  "food-dark",
  "food-light",
  "food-bosque",
  "food-crema",
  "food-remolacha",
  "food-mar",
] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  "food-dark": "Oscuro",
  "food-light": "Claro",
  "food-bosque": "Bosque",
  "food-crema": "Crema",
  "food-remolacha": "Remolacha",
  "food-mar": "Mar",
};

const STORAGE_KEY = "ninja-food-theme";
const DEFAULT_THEME: Theme = "food-dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored && THEMES.includes(stored)) {
      setThemeState(stored);
      document.documentElement.dataset.theme = stored;
    }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
    // TODO(fase 0): persistir también en public.users.settings (patrón POS,
    // lib/theme/preferences.ts) cuando exista sesión.
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
