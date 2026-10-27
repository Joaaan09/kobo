import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { ThemePref } from '../lib/types';
import {
  applyTheme,
  onSystemThemeChange,
  readMincho,
  readNavKanji,
  readThemePref,
  resolveTheme,
  writeMincho,
  writeNavKanji,
  writeThemePref,
  type ResolvedTheme,
} from './theme';

interface ThemeContextValue {
  /** Tema elegido: `washi` | `sumi` | `auto` (auto sigue al sistema). */
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
  /** Tema que se está pintando de verdad: con `auto`, el del sistema. */
  resolvedTheme: ResolvedTheme;
  /** "Cifras en Mincho": ON por defecto; OFF vuelve las cifras a sans. */
  mincho: boolean;
  setMincho: (on: boolean) => void;
  /** "Kanji en la navegación": ON por defecto; OFF vuelve la nav a iconos SVG. */
  navKanji: boolean;
  setNavKanji: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(readThemePref);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readThemePref()),
  );
  const [mincho, setMinchoState] = useState<boolean>(readMincho);
  const [navKanji, setNavKanjiState] = useState<boolean>(readNavKanji);

  // Persiste la preferencia y recalcula el tema efectivo.
  useEffect(() => {
    writeThemePref(theme);
    setResolvedTheme(resolveTheme(theme));
  }, [theme]);

  // Con "auto", seguir al sistema en vivo (el usuario cambia el modo del móvil
  // con la app abierta). Con tema fijo no hay nada que escuchar.
  useEffect(() => {
    if (theme !== 'auto') return;
    return onSystemThemeChange(() => setResolvedTheme(resolveTheme('auto')));
  }, [theme]);

  // Único punto que toca el DOM: data-theme + color-scheme + theme-color.
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // "Cifras en Mincho": con OFF, la clase conmuta --font-numbers a sans.
  useEffect(() => {
    document.documentElement.classList.toggle('numbers-sans', !mincho);
    writeMincho(mincho);
  }, [mincho]);

  // "Kanji en la navegación": no toca el DOM, solo se persiste (lo lee el shell).
  useEffect(() => {
    writeNavKanji(navKanji);
  }, [navKanji]);

  const setTheme = useCallback((next: ThemePref) => setThemeState(next), []);
  const setMincho = useCallback((on: boolean) => setMinchoState(on), []);
  const setNavKanji = useCallback((on: boolean) => setNavKanjiState(on), []);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, resolvedTheme, mincho, setMincho, navKanji, setNavKanji }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}
