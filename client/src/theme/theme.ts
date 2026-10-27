/**
 * Lógica de tema, sin React. La comparte el ThemeProvider con el script anti-FOUC
 * de `client/index.html` (ese va inline y no puede importar nada: si tocas las
 * claves de localStorage o la resolución de "auto", actualiza también aquel).
 */
import type { ThemePref } from '../lib/types';

/** Tema ya resuelto: lo que se pinta. "auto" nunca llega al DOM. */
export type ResolvedTheme = 'washi' | 'sumi';

export const THEME_KEY = 'kobo.theme';
export const MINCHO_KEY = 'kobo.mincho';
export const NAV_KANJI_KEY = 'kobo.navKanji';

/** Por defecto seguimos al sistema (coincide con `prefs.theme` del User en el server). */
export const DEFAULT_THEME: ThemePref = 'auto';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Acceso a localStorage tolerante a fallos (modo privado, iframes bloqueados). */
function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Sin persistencia: la preferencia dura lo que la sesión. */
  }
}

export function readThemePref(): ThemePref {
  const v = safeRead(THEME_KEY);
  return v === 'washi' || v === 'sumi' || v === 'auto' ? v : DEFAULT_THEME;
}

export function writeThemePref(theme: ThemePref): void {
  safeWrite(THEME_KEY, theme);
}

export function readMincho(): boolean {
  // Por defecto ON (DESIGN §2). Solo la cadena 'false' lo desactiva.
  return safeRead(MINCHO_KEY) !== 'false';
}

export function writeMincho(on: boolean): void {
  safeWrite(MINCHO_KEY, String(on));
}

export function readNavKanji(): boolean {
  // Por defecto ON: el mockup canónico lleva kanji en la barra inferior (DESIGN §17).
  // Solo la cadena 'false' devuelve la nav a los iconos SVG.
  return safeRead(NAV_KANJI_KEY) !== 'false';
}

export function writeNavKanji(on: boolean): void {
  safeWrite(NAV_KANJI_KEY, String(on));
}

export function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Traduce la preferencia al tema que toca pintar ahora mismo. */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'auto') return prefersDark() ? 'sumi' : 'washi';
  return pref;
}

/** Suscribe a los cambios de tema del sistema. Devuelve la baja. */
export function onSystemThemeChange(cb: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * Aplica el tema al documento: atributo `data-theme` (manda en tokens.css),
 * `color-scheme` (scrollbars, autofill y controles nativos) y el chrome del
 * sistema: `theme-color` + la barra de estado de iOS en standalone.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved === 'sumi' ? 'dark' : 'light';

  // Se lee del token para no duplicar el color: tokens.css es la única fuente.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) {
    // TODAS las metas (la de esquema claro y la de oscuro) con el MISMO color: manda
    // el tema de Kobo, no el del móvil. Si la variante `dark` se quedara en tinta, un
    // iPhone en modo oscuro pintaría la franja del notch negra con la app en Washi.
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', bg));
  }

  // iOS standalone pinta la barra de estado con este meta legacy. Solo lo lee al
  // lanzar la app (por eso el anti-FOUC de index.html lo fija también), pero se
  // mantiene en sync para el arranque siguiente cuando se cambia de tema en Ajustes.
  const statusBar = document.querySelector(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
  );
  if (statusBar) statusBar.setAttribute('content', resolved === 'sumi' ? 'black' : 'default');
}
