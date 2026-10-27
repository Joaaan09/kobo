/**
 * Instalación de la PWA — detección de plataforma, estado "ya instalada" y
 * captura del prompt nativo.
 *
 * Tres mundos distintos, y conviene tenerlos claros:
 *  - **Android/Chrome/Edge**: el navegador dispara `beforeinstallprompt` cuando
 *    la app cumple los criterios (manifest + SW + HTTPS). Se puede instalar de
 *    un toque, pero **el evento solo se puede usar una vez** y hay que
 *    guardárselo: si no se llama a `preventDefault()`, Chrome pinta su propia
 *    barrita y nosotros perdemos el control del momento.
 *  - **iOS**: `beforeinstallprompt` **no existe**. La única vía es
 *    Compartir → "Añadir a pantalla de inicio", a mano. Por eso hay guía.
 *  - **Escritorio**: hay prompt en Chrome/Edge; en el resto, icono en la barra.
 *
 * El evento llega pronto (justo tras `load`), así que la captura se instala
 * desde `main.tsx` **antes** de montar React y se guarda aquí, en el módulo. Los
 * componentes leen el estado con `useInstall()` (`useSyncExternalStore`).
 *
 * En dev no hay service worker (ver `pwa.ts`), así que no habrá prompt nativo:
 * lo que se ve en `npm run dev` es siempre el camino manual.
 */
import { useSyncExternalStore } from 'react';

/** `beforeinstallprompt` no está en lib.dom: solo lo implementan los Chromium. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';

export interface InstallState {
  /** Hay prompt nativo guardado: se puede instalar de un toque. */
  canPrompt: boolean;
  /** Corriendo ya en standalone, o instalada desde este navegador. */
  installed: boolean;
}

/** Ya se instaló desde este navegador (la pestaña sigue abierta y no lo sabría). */
const KEY_INSTALLED = 'kobo.install.done';
/** Cuándo se dijo "ahora no" al aviso del login (ms epoch). */
const KEY_DISMISSED = 'kobo.install.dismissed';
/** Descartar el aviso lo silencia dos semanas; insistir cada visita es spam. */
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Modo privado o almacenamiento bloqueado: se degrada a "no hay nada guardado".
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* idem */
  }
}

/** ¿Está corriendo dentro de la ventana de la app (no en una pestaña)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS no implementa `display-mode`; expone este flag propietario.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
}

/**
 * Plataforma del dispositivo. Se mira el user agent a propósito: aquí no
 * interesan las capacidades del navegador sino **qué instrucciones enseñar**,
 * y eso depende del sistema operativo que tiene el usuario delante.
 */
export function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPadOS 13+ se presenta como un Mac de escritorio; el táctil es lo único que lo delata.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Navegador, solo para decir dónde está el botón ("abajo" vs. "arriba a la derecha"). */
export function detectBrowser(): InstallBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // En iOS todos son WebKit por dentro: el sufijo del UA es lo que los distingue.
  if (/CriOS|Chrome/.test(ua) && !/Edg|EdgiOS|OPR/.test(ua)) return 'chrome';
  if (/EdgiOS|Edg/.test(ua)) return 'edge';
  if (/FxiOS|Firefox/.test(ua)) return 'firefox';
  if (/Safari/.test(ua)) return 'safari';
  return 'other';
}

/**
 * Navegador embebido de otra app (Instagram, Facebook, TikTok…). Importa porque
 * **desde ahí no se puede instalar nada**: la única salida es abrir la página en
 * el navegador de verdad, y si no se dice, el usuario se queda dando vueltas.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|WebView|; wv\)/.test(navigator.userAgent);
}

// ---------------------------------------------------------------------------
// Store del prompt nativo
// ---------------------------------------------------------------------------

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/* El snapshot se cachea por referencia: `useSyncExternalStore` compara con
   `Object.is`, así que devolver un objeto nuevo en cada lectura sería un bucle
   infinito de renders. Solo se sustituye cuando cambia algún campo. */
let snapshot: InstallState = {
  canPrompt: false,
  installed: isStandalone() || readKey(KEY_INSTALLED) === '1',
};

function publish(next: InstallState): void {
  if (next.canPrompt === snapshot.canPrompt && next.installed === snapshot.installed) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): InstallState {
  return snapshot;
}

function markInstalled(): void {
  writeKey(KEY_INSTALLED, '1');
  deferred = null;
  publish({ canPrompt: false, installed: true });
}

/**
 * Arranca la captura del prompt. Llamar **una sola vez y lo antes posible**
 * (`main.tsx`): el evento se dispara solo, y si nadie lo ha guardado cuando
 * llega, se pierde para el resto de la sesión.
 */
export function initInstallPrompt(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin esto Chrome enseña su propia barrita: el momento lo elegimos nosotros.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    publish({ ...snapshot, canPrompt: true });
  });

  // Llega tras aceptar la instalación. La pestaña sigue viva y en el navegador,
  // así que sin este flag seguiríamos ofreciendo instalar algo ya instalado.
  window.addEventListener('appinstalled', markInstalled);

  // Abrir la app instalada desde la pantalla de inicio puede reusar el documento.
  const mq = window.matchMedia('(display-mode: standalone)');
  const onModeChange = () => {
    if (mq.matches) markInstalled();
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onModeChange);
}

/**
 * Lanza el diálogo nativo de instalación. Devuelve `unavailable` si no había
 * prompt guardado (iOS, Firefox, o Chrome que aún no lo ha ofrecido).
 *
 * El evento se consume: si el usuario dice que no, Chrome vuelve a dispararlo
 * más adelante y `canPrompt` se pondrá solo.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evt = deferred;
  if (!evt) return 'unavailable';
  deferred = null;
  publish({ ...snapshot, canPrompt: false });
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === 'accepted') markInstalled();
    return outcome;
  } catch {
    return 'unavailable';
  }
}

/** ¿Se le ofrece el aviso del login? Móvil, sin instalar y sin "ahora no" reciente. */
export function shouldOfferInstall(): boolean {
  if (snapshot.installed || isStandalone()) return false;
  if (detectPlatform() === 'desktop') return false;
  const dismissed = Number(readKey(KEY_DISMISSED) ?? 0);
  return !(dismissed > 0 && Date.now() - dismissed < DISMISS_MS);
}

/** "Ahora no": silencia el aviso del login durante `DISMISS_MS`. */
export function dismissInstallOffer(): void {
  writeKey(KEY_DISMISSED, String(Date.now()));
}

/** Se resuelven una vez: el user agent no cambia mientras la pestaña vive. */
export const PLATFORM: InstallPlatform = detectPlatform();
export const BROWSER: InstallBrowser = detectBrowser();

/** Estado de instalación, reactivo. `platform`/`browser` no cambian en vida de la pestaña. */
export function useInstall(): InstallState & {
  platform: InstallPlatform;
  browser: InstallBrowser;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  return { ...state, platform: PLATFORM, browser: BROWSER };
}
