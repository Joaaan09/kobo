import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { lockBodyScroll, unlockBodyScroll } from '../lib/scrollLock';
import { IconButton } from './IconButton';
import { IconClose } from './icons';
import styles from './BottomSheet.module.css';

/**
 * Duraciones de entrada y salida. **Deben casar con `--dur-sheet-in` /
 * `--dur-sheet-out`** (tokens.css): aquí solo miden cuándo la hoja está quieta
 * y cuándo se puede cerrar el `<dialog>` de verdad; el movimiento lo lleva el
 * CSS. Son distintas a propósito (DESIGN.md §13): entrar es un momento que se
 * mira, salir es quitarse de en medio.
 */
const ENTRADA_MS = 340;
const SALIDA_MS = 240;
/**
 * Cambio del hueco inferior a partir del cual se considera que ha aparecido o
 * desaparecido el teclado (y no que la barra del navegador ha bailado unos px).
 * Solo decide si se trae el campo enfocado a la vista: la hoja se recoloca
 * siempre, sea cual sea el cambio.
 */
const CAMBIO_REAL_PX = 40;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Etiqueta accesible del diálogo si no hay `title` visible. */
  ariaLabel?: string;
}

/**
 * Hoja inferior sobre `<dialog>` (modal nativo: trap de foco + Esc gratis).
 * Entra deslizando desde abajo con leve overshoot; backdrop con blur.
 * Cierra con Esc, tap fuera o el botón ✕. Respeta `prefers-reduced-motion`.
 *
 * El ciclo de apertura tiene un orden que NO se puede alterar (ver comentarios
 * en el efecto): bloquear el fondo → abrir → recolocar el foco → animar → y solo
 * al final, ya asentada, enfocar el primer campo.
 *
 * Foco inicial: marca el campo con `data-autofocus` (no con `autoFocus`, que aquí
 * no funciona: React lo aplica en el commit, con el `<dialog>` aún en
 * `display: none`). Se enfoca solo en escritorio y con `preventScroll`; márcalo
 * únicamente en un campo visible sin scroll.
 */
export function BottomSheet({ open, onClose, title, children, ariaLabel }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Solo en el cierre: dispara la animación de salida antes de cerrar el diálogo.
  // La entrada no necesita estado (la lleva el CSS al salir de `display: none`).
  const [saliendo, setSaliendo] = useState(false);

  // "Asentada" = la animación de entrada terminó. Hasta entonces no se enfoca
  // ningún campo: hacerlo a mitad del deslizamiento levanta el teclado mientras
  // la hoja aún se mueve.
  const settledRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (open) {
      // ORDEN CRÍTICO — el bloqueo del fondo va ANTES de `showModal()`, que
      // enfoca por su cuenta el primer control del diálogo y puede pedirle al
      // navegador que lo traiga a la vista. Con el `body` ya fijo, el documento
      // no tiene scroll que dar y ese desplazamiento no puede ocurrir.
      lockBodyScroll();
      if (!dialog.open) dialog.showModal();

      // Se recupera el foco del ✕ (Enter sobre él cerraría la hoja recién
      // abierta) y se deshace cualquier desplazamiento interno que el
      // scroll-into-view nativo hubiera dejado en el panel.
      const panel = panelRef.current;
      if (panel) {
        panel.scrollTop = 0;
        panel.focus({ preventScroll: true });
      }

      // La entrada la lleva una animación por keyframes del CSS, que arranca sola
      // al salir el diálogo de `display: none`. Aquí no hay nada que sincronizar:
      // el doble rAF que había antes existía para que la TRANSICIÓN registrara su
      // estado inicial, y era justo la pieza que Safari se saltaba.
      setSaliendo(false);

      // Hoja ya quieta: se enfoca el campo `data-autofocus`, pero SOLO en
      // escritorio. En móvil el foco automático no aporta y hace daño: en iOS el
      // foco programático no levanta el teclado (hace falta un gesto) y en
      // Android sí lo levanta, tapando la hoja nada más abrirse.
      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const settle = window.setTimeout(
        () => {
          settledRef.current = true;
          if (finePointer) {
            panelRef.current
              ?.querySelector<HTMLElement>('[data-autofocus]')
              ?.focus({ preventScroll: true });
          }
        },
        reduce ? 0 : ENTRADA_MS,
      );

      return () => {
        window.clearTimeout(settle);
        settledRef.current = false;
        unlockBodyScroll();
      };
    }

    // Cierre: el panel desliza fuera y el velo funde con él; solo cuando ambos
    // han terminado se cierra el diálogo (cerrarlo antes sería el corte seco).
    setSaliendo(true);
    const timer = window.setTimeout(() => {
      if (dialog.open) dialog.close();
    }, reduce ? 0 : SALIDA_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  /*
   * Ancla la hoja al viewport VISIBLE. En iOS el teclado se SUPERPONE (el layout
   * viewport, al que se ancla un `position: fixed`, no cambia; `interactive-widget`
   * solo lo respeta Safari 26+), así que una hoja pegada a `inset: 0` se queda
   * literalmente debajo del teclado. Se mide `visualViewport` y se publica su
   * geometría como CSS vars: el diálogo pasa a ser exactamente el trozo de
   * pantalla que el usuario ve, y el panel se apoya en su borde inferior.
   *
   * Es GEOMETRÍA, no adivinanza: se aplica siempre, sin umbrales ni esperas. El
   * intento anterior deducía "¿hay teclado?" de un hueco mayor que 140px y fallaba
   * justo cuando iOS desplaza el viewport para revelar el campo (`offsetTop > 0`
   * encoge ese hueco por debajo del umbral y la hoja no se movía). `--sheet-kb`
   * sobrevive solo para un detalle cosmético: cancelar la safe-area inferior, que
   * bajo el teclado es aire muerto.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const vv = window.visualViewport;
    if (!vv) return;

    let kbPrevio = 0;
    let raf = 0;

    const sync = () => {
      const top = Math.max(0, Math.round(vv.offsetTop));
      const alto = Math.round(vv.height);
      // Lo que el teclado (o la barra del navegador) tapa por debajo del área
      // visible, dentro del layout viewport al que sigue anclado el diálogo.
      const kb = Math.max(0, Math.round(window.innerHeight - alto - top));

      dialog.style.setProperty('--sheet-top', `${top}px`);
      dialog.style.setProperty('--sheet-vh', `${alto}px`);
      dialog.style.setProperty('--sheet-kb', `${kb}px`);

      /*
       * Al encoger el área visible, el panel encoge con ella y su contenido pasa
       * a hacer scroll interno: el campo que se está rellenando puede quedar
       * fuera. Se trae a la vista, pero solo cuando el hueco cambia DE VERDAD
       * (abrir/cerrar el teclado), no con los pocos píxeles que baila la barra
       * del navegador ni en cada evento de scroll: si no, perseguiría al usuario
       * mientras se desplaza.
       */
      if (Math.abs(kb - kbPrevio) > CAMBIO_REAL_PX) {
        kbPrevio = kb;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const active = document.activeElement as HTMLElement | null;
          const panel = panelRef.current;
          if (!active || !panel || active === panel || !panel.contains(active)) return;
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          active.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
        });
      }
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    // El teclado solo sube al enfocar; recalculamos también en foco/desenfoque.
    window.addEventListener('focusin', sync);
    window.addEventListener('focusout', sync);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('focusin', sync);
      window.removeEventListener('focusout', sync);
      // No dejamos las vars pegadas cuando la hoja se cierra o se desmonta.
      dialog.style.removeProperty('--sheet-top');
      dialog.style.removeProperty('--sheet-vh');
      dialog.style.removeProperty('--sheet-kb');
    };
  }, [open]);

  // Esc → el diálogo emite 'cancel'; lo interceptamos para avisar al padre.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      // El velo (`::backdrop`) es un pseudo-elemento del diálogo: su fundido de
      // salida solo se puede disparar desde una clase de aquí, no del panel.
      className={cx(styles.dialog, saliendo && styles.saliendoVelo)}
      // Fuera del "tirar para recargar" del shell: con una hoja abierta, arrastrar
      // hacia abajo no puede reiniciar la app (perderías lo que estés escribiendo).
      data-ptr="off"
      aria-label={title ? undefined : ariaLabel}
      aria-labelledby={title ? 'sheet-title' : undefined}
      onMouseDown={(e) => {
        // Clic en el área del backdrop (el propio dialog, fuera del panel) → cerrar.
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {/* `tabIndex={-1}`: el panel es el punto de partida del foco al abrir (no
          es interactivo, solo enfocable por programa; Tab sigue al primer control). */}
      <div ref={panelRef} tabIndex={-1} className={cx(styles.panel, saliendo && styles.saliendo)}>
        <div className={styles.grabber} aria-hidden />
        {title ? (
          <header className={styles.header}>
            <h2 id="sheet-title" className={styles.title}>
              {title}
            </h2>
            <IconButton label="Cerrar" onClick={onClose}>
              <IconClose />
            </IconButton>
          </header>
        ) : null}
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
