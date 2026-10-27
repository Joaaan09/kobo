import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '../ui';
import { cx } from '../lib/cx';
import styles from './PullToRefresh.module.css';

/* PullToRefresh — "tirar para recargar" de la PWA instalada.
 *
 * Mismo gesto que ya funciona en otros proyectos hermanos, portado al shell
 * de Kobo. Dos diferencias propias:
 *  1. En Kobo el scroll vive en el DOCUMENTO (el shell es `min-height: 100dvh`,
 *     no un contenedor con overflow), así que el "estoy arriba del todo" se mide
 *     contra `window.scrollY`; aun así se busca antes un ancestro scrollable por
 *     si el toque cae dentro de un panel con scroll propio.
 *  2. La recarga es "dura": antes de `location.reload()` se le pide al service
 *     worker que compruebe si hay versión nueva (ver `refreshHard`).
 */

// Umbrales del gesto (los mismos valores que en los proyectos hermanos).
const START_SLOP = 10; // holgura inicial: ignora microtoques
const RESISTANCE = 0.4; // resistencia al arrastre (tacto elástico)
const MAX_PULL = 60; // tope de desplazamiento del indicador (px)
const TRIGGER = 50; // a partir de aquí, al soltar → recarga
const SPINNER_MIN = 700; // ms mínimos de spinner antes de recargar (acuse del gesto)
const SW_TIMEOUT = 600; // tope de espera al service worker; pasado esto, se recarga igual

/**
 * Solo en la PWA instalada. En una pestaña normal el navegador ya trae su propio
 * "tirar para recargar" y su botón de recarga; en standalone no hay ni uno ni otro
 * (y `overscroll-behavior: none`, DESIGN.md §15, apaga el nativo a propósito).
 */
function isStandalone(): boolean {
  const mm = window.matchMedia?.('(display-mode: standalone)').matches;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mm) || ios;
}

/** Ancestro scrollable vertical más cercano al toque, sin salir del wrapper. */
function scrollableAncestor(start: Element | null, boundary: Element): HTMLElement | null {
  let el = start as HTMLElement | null;
  while (el && el !== boundary) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

/** ¿Está arriba del todo? Sin contenedor propio, manda el scroll del documento. */
function atTop(el: HTMLElement | null): boolean {
  if (el) return el.scrollTop <= 0;
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
}

/**
 * Zonas declaradas fuera del gesto con `data-ptr="off"`. Lo lleva la primitiva
 * `BottomSheet`: con una hoja abierta, arrastrar hacia abajo es el gesto de
 * cerrarla o de mover su contenido, nunca el de reiniciar la app (y perder lo
 * que estabas escribiendo).
 */
function pullDisabled(start: Element | null, boundary: Element): boolean {
  let el = start as HTMLElement | null;
  while (el && el !== boundary) {
    if (el.dataset.ptr === 'off') return true;
    el = el.parentElement;
  }
  return false;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Recarga "dura": pide al service worker que busque versión nueva antes de recargar.
 * Sin esto el reload puede devolver el mismo bundle, porque `public/sw.js` sirve los
 * assets con hash en *cache-first* y el `index.html` cacheado es el fallback offline.
 * El SW de Kobo hace `skipWaiting()` al instalar, así que si hay versión nueva toma
 * el control y purga las cachés viejas antes de que la página se vuelva a pintar.
 * Todo con tope de tiempo: si el SW no contesta, se recarga igual.
 */
async function refreshHard(): Promise<void> {
  const updated = (async () => {
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    } catch {
      // Sin red o SW no disponible: la recarga normal es el mejor esfuerzo posible.
    }
  })();

  await Promise.all([wait(SPINNER_MIN), Promise.race([updated, wait(SW_TIMEOUT)])]);
  window.location.reload();
}

interface PullToRefreshProps {
  children: ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Estado de trabajo del gesto en refs: un touchmove no debe provocar render
  // por cada píxel, solo el cambio de `distance`.
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const validRef = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const refreshingRef = useRef(false);
  // Espejo de `distance`: al soltar hay que decidir con el valor ya conocido, no
  // dentro del updater de `setState` (React lo puede invocar dos veces y dispararía
  // dos recargas). El efecto secundario vive fuera del estado.
  const distanceRef = useRef(0);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !isStandalone()) return;

    const pull = (px: number) => {
      distanceRef.current = px;
      setDistance(px);
    };

    const cancel = () => {
      validRef.current = false;
      pull(0);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || pullDisabled(e.target as Element, wrapper)) {
        validRef.current = false;
        return;
      }
      const sc = scrollableAncestor(e.target as Element, wrapper);
      // Si ya hay scroll por debajo del dedo, esto es scroll normal, no un pull.
      if (!atTop(sc)) {
        validRef.current = false;
        return;
      }
      scrollElRef.current = sc;
      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      validRef.current = true;
      setDragging(true);
    };

    const onMove = (e: TouchEvent) => {
      if (!validRef.current) return;
      if (!atTop(scrollElRef.current)) {
        cancel();
        return;
      }

      const dy = e.touches[0].clientY - startYRef.current;
      const dx = e.touches[0].clientX - startXRef.current;

      // Bloqueo de eje: un gesto predominantemente horizontal (paneo de un carril,
      // deslizar en una lista) no es un pull — se cancela en vez de competir con él.
      if (Math.abs(dx) > Math.abs(dy)) {
        cancel();
        return;
      }
      if (dy <= 0) {
        pull(0);
        return;
      }
      if (dy < START_SLOP) return;

      // Con el pull activo, el navegador no debe hacer nada por su cuenta.
      if (e.cancelable) e.preventDefault();
      pull(Math.min((dy - START_SLOP) * RESISTANCE, MAX_PULL));
    };

    const onEnd = () => {
      setDragging(false);
      if (!validRef.current) return;
      validRef.current = false;
      if (distanceRef.current >= TRIGGER) {
        pull(TRIGGER); // el indicador se queda a la vista durante la recarga
        setRefreshing(true);
        void refreshHard();
        return;
      }
      pull(0); // por debajo del umbral: vuelve arriba sin hacer nada
    };

    wrapper.addEventListener('touchstart', onStart, { passive: true });
    wrapper.addEventListener('touchmove', onMove, { passive: false });
    wrapper.addEventListener('touchend', onEnd, { passive: true });
    wrapper.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      wrapper.removeEventListener('touchstart', onStart);
      wrapper.removeEventListener('touchmove', onMove);
      wrapper.removeEventListener('touchend', onEnd);
      wrapper.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <div
        className={cx(styles.indicator, dragging && styles.dragging)}
        style={{ transform: `translate(-50%, ${distance}px)`, opacity: Math.min(distance / 40, 1) }}
        aria-hidden={refreshing ? undefined : true}
      >
        {refreshing ? (
          <Spinner size={18} inline />
        ) : (
          // Anillo quieto: lo gira el dedo, no una animación. Al soltar lo releva
          // el <Spinner> —misma caja y mismo trazo—, así que el cambio no se ve.
          <span className={styles.ring} style={{ transform: `rotate(${distance * 6}deg)` }} />
        )}
      </div>
      {children}
    </div>
  );
}
