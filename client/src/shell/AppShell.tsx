import { useEffect, useRef, type ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cx } from '../lib/cx';
import { useTheme } from '../theme/ThemeProvider';
import { MonthProvider, useMonth } from './MonthContext';
import { PullToRefresh } from './PullToRefresh';
import { AddTransactionProvider, useAddTransaction } from '../features/add-transaction/AddTransactionContext';
import {
  Daruma,
  IconButton,
  IconChevronLeft,
  IconChevronRight,
  IconCuentas,
  IconGastos,
  IconMeses,
  IconPlus,
  IconTaller,
  IconYo,
  type IconProps,
} from '../ui';
import styles from './AppShell.module.css';

interface Tab {
  to: string;
  label: string;
  /** Kanji del destino (mockup canónico). Decorativo: la etiqueta en español va debajo. */
  kanji: string;
  Icon: (props: IconProps) => ReactElement;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Taller', kanji: '房', Icon: IconTaller, end: true },
  { to: '/gastos', label: 'Gastos', kanji: '記', Icon: IconGastos },
  { to: '/cuentas', label: 'Cuentas', kanji: '財', Icon: IconCuentas },
  { to: '/meses', label: 'Meses', kanji: '月', Icon: IconMeses },
  { to: '/yo', label: 'Yo', kanji: '我', Icon: IconYo },
];

/** Layout móvil: cabecera glass + contenido (Outlet) + barra inferior + FAB de añadir. */
export function AppShell() {
  return (
    <MonthProvider>
      <AddTransactionProvider>
        {/* Envuelve el shell entero: el gesto de recargar se arma en cualquier
            vista, y la píldora del indicador es `fixed` (no altera el layout). */}
        <PullToRefresh>
          <ShellChrome />
        </PullToRefresh>
      </AddTransactionProvider>
    </MonthProvider>
  );
}

function ShellChrome() {
  const { month, name, range, next, prev, dir } = useMonth();
  const { open } = useAddTransaction();
  const { navKanji } = useTheme();
  const navRef = useRef<HTMLElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useReanchorFixedOnResume(navRef, fabRef);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Daruma size={30} />
          <span className={styles.wordmark}>KOBO</span>
        </div>

        <div className={styles.month} aria-label="Mes activo">
          <IconButton label="Mes anterior" variant="ghost" onClick={prev}>
            <IconChevronLeft size={20} />
          </IconButton>
          {/* El `aria-live` se queda en el contenedor ESTABLE: la `key` de dentro
              remonta el nombre en cada salto (es lo que rearranca la animación),
              y una región viva que se remonta con él no anunciaría el cambio. */}
          <span className={styles.monthName} aria-live="polite">
            <span key={month} className={styles.monthNameInner} data-dir={dir}>
              {name}
              {/* Con el mes empezando el día de cobro, el nombre solo no basta:
                  "Octubre" va del 25 oct al 24 nov. */}
              {range ? <span className={styles.monthRange}>{range}</span> : null}
            </span>
          </span>
          <IconButton label="Mes siguiente" variant="ghost" onClick={next}>
            <IconChevronRight size={20} />
          </IconButton>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <button ref={fabRef} className={styles.fab} type="button" onClick={() => open()} aria-label="Añadir movimiento">
        <IconPlus />
      </button>

      {/* Misma <nav> en los dos modos: barra inferior en móvil, rail lateral en
          escritorio (DESIGN.md §19.3). La marca y el botón "+ Añadir" del rail
          son nodos APARTE de los del móvil (cabecera y FAB): CSS no mueve nodos
          de sitio. Cada pareja se oculta con `display: none` en el modo que no
          le toca, que sí los saca del árbol de accesibilidad — ningún lector
          anuncia dos veces el mismo destino. */}
      <nav ref={navRef} className={styles.nav} aria-label="Navegación principal">
        <div className={styles.railBrand}>
          <Daruma size={28} />
          <span className={styles.wordmark}>KOBO</span>
        </div>

        <div className={styles.tabs}>
          {TABS.map(({ to, label, kanji, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cx(styles.tab, isActive && styles.tabActive)}
            >
              {navKanji ? (
                <span className={styles.tabKanji} aria-hidden="true">
                  {kanji}
                </span>
              ) : (
                <Icon size={24} />
              )}
              <span className={styles.tabLabel}>{label}</span>
            </NavLink>
          ))}
        </div>

        {/* El nombre accesible amplía el texto visible sin contradecirlo
            ("Añadir movimiento" contiene "Añadir", WCAG 2.5.3). */}
        <button
          className={styles.railAdd}
          type="button"
          onClick={() => open()}
          aria-label="Añadir movimiento"
        >
          <IconPlus size={18} />
          Añadir
        </button>
      </nav>
    </div>
  );
}

/**
 * Reancla los elementos `position: fixed` al viewport real cuando la PWA vuelve
 * de segundo plano.
 *
 * Bug de iOS en standalone: al reanudar la app tras salir a otra y volver, Safari
 * recoloca mal los elementos fijos anclados abajo (`bottom: 0`) y la barra de
 * navegación —y el FAB— quedan flotando a media pantalla. El `translateZ(0)` del
 * CSS estabiliza el caso de scroll/teclado, pero no cubre el reanudado: ahí no hay
 * ningún evento de layout, así que la caja fija se queda contra un viewport viejo.
 *
 * Cuando el documento vuelve a ser visible (`visibilitychange`/`pageshow`) se
 * fuerza un reflujo de cada elemento fijo: se le quita y se le devuelve el
 * `transform` (recompone su capa) y se lee `offsetHeight` para forzar el layout
 * síncrono dentro del mismo frame —el estado intermedio no llega a pintarse, así
 * que no hay parpadeo—. Un empujón de scroll de 1px re-sincroniza el viewport
 * visual con el de layout, que es lo que iOS deja desalineado al reanudar.
 *
 * Solo se arma en la PWA instalada: es donde ocurre el bug y donde no hay chrome
 * del navegador que fuerce el repintado por su cuenta.
 */
function useReanchorFixedOnResume(
  navRef: React.RefObject<HTMLElement>,
  fabRef: React.RefObject<HTMLButtonElement>,
) {
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const reanchor = () => {
      const y = window.scrollY;
      window.scrollTo(0, y + 1);
      window.scrollTo(0, y);
      for (const el of [navRef.current, fabRef.current]) {
        if (!el) continue;
        el.style.transform = 'none';
        void el.offsetHeight; // lectura forzada → reflujo síncrono (recalcula la caja fija)
        el.style.transform = '';
      }
    };

    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      // rAF: deja que el viewport se asiente antes de reanclar.
      requestAnimationFrame(reanchor);
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [navRef, fabRef]);
}
