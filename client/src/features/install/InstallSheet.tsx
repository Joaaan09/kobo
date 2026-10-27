import { useEffect, useState, type ReactNode } from 'react';
import {
  BottomSheet,
  Button,
  IconAddToHome,
  IconDots,
  IconInstall,
  IconShare,
  Segmented,
} from '../../ui';
import {
  isInAppBrowser,
  promptInstall,
  useInstall,
  type InstallBrowser,
  type InstallPlatform,
} from '../../lib/install';
import styles from './InstallSheet.module.css';

interface InstallSheetProps {
  open: boolean;
  onClose: () => void;
}

interface Step {
  /** Glifo del propio sistema (Compartir, ⋮…): reconocerlo es media instrucción. */
  icon?: ReactNode;
  text: ReactNode;
}

const TABS: { value: InstallPlatform; label: string }[] = [
  { value: 'ios', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'desktop', label: 'Ordenador' },
];

/**
 * Dónde vive el botón Compartir en iOS. En Safari está en la barra inferior; en
 * Chrome/Edge/Firefox (que por dentro son el mismo WebKit) está arriba. Si el
 * usuario está mirando la guía desde otro aparato no se afina: se dice "la barra
 * del navegador" y punto.
 */
function shareLocation(own: boolean, browser: InstallBrowser): string {
  if (!own) return 'en la barra del navegador';
  if (browser === 'safari') return 'en la barra de abajo';
  return 'arriba, junto a la dirección';
}

function stepsFor(platform: InstallPlatform, own: boolean, browser: InstallBrowser): Step[] {
  if (platform === 'ios') {
    return [
      {
        icon: <IconShare size={18} />,
        text: (
          <>
            Toca <strong>Compartir</strong> {shareLocation(own, browser)}.
          </>
        ),
      },
      {
        icon: <IconAddToHome size={18} />,
        text: (
          <>
            Desliza y elige <strong>Añadir a pantalla de inicio</strong>.
          </>
        ),
      },
      {
        text: (
          <>
            Confirma con <strong>Añadir</strong>. Kobo quedará como una app más, a pantalla completa
            y sin barra del navegador.
          </>
        ),
      },
    ];
  }

  if (platform === 'android') {
    return [
      {
        icon: <IconDots size={18} />,
        text: (
          <>
            Abre el <strong>menú</strong> del navegador (arriba a la derecha).
          </>
        ),
      },
      {
        icon: <IconInstall size={18} />,
        text: (
          <>
            Elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>
            .
          </>
        ),
      },
      {
        text: (
          <>
            Confirma <strong>Instalar</strong>.
          </>
        ),
      },
    ];
  }

  return [
    {
      icon: <IconInstall size={18} />,
      text: (
        <>
          En la barra de direcciones, pulsa el icono de <strong>instalar</strong> (a la derecha del
          todo).
        </>
      ),
    },
    {
      icon: <IconDots size={18} />,
      text: (
        <>
          Si no aparece: <strong>menú</strong> del navegador → <strong>Instalar Kobo</strong>. En
          Safari de Mac: <strong>Archivo → Añadir al Dock</strong>.
        </>
      ),
    },
    { text: <>Kobo se abrirá en su propia ventana, sin pestañas ni barra de direcciones.</> },
  ];
}

/** Coletilla propia de cada plataforma, debajo de los pasos. */
function noteFor(platform: InstallPlatform): string {
  if (platform === 'ios') {
    return 'En el iPhone no se descarga desde la App Store: la instala el propio navegador. Funciona en Safari y, desde iOS 16.4, también en Chrome y Firefox.';
  }
  if (platform === 'android') {
    return 'Ocupa unos pocos kilobytes: no se descarga una app, se guarda un acceso que ya funciona sin conexión.';
  }
  return 'Disponible en Chrome, Edge y Safari 17+. En Firefox de escritorio no hay instalación: úsala como pestaña.';
}

/**
 * Hoja "Instalar Kobo" — la guía para añadir la PWA a la pantalla de inicio.
 *
 * Es la misma pieza para los dos sitios que la abren (Ajustes → Yo y el aviso
 * del login), y siempre trae las tres plataformas: lo habitual es que alguien
 * mire la guía del iPhone desde el ordenador para hacerlo luego en el móvil.
 * Arranca en la plataforma detectada.
 */
export function InstallSheet({ open, onClose }: InstallSheetProps) {
  const { canPrompt, installed, platform, browser } = useInstall();
  const [tab, setTab] = useState<InstallPlatform>(platform);

  // Al reabrir la hoja se vuelve a "su" plataforma: si la última vez se miró la
  // del iPhone desde el ordenador, esa curiosidad no debe quedarse pegada.
  useEffect(() => {
    if (open) setTab(platform);
  }, [open, platform]);

  const own = tab === platform;
  const steps = stepsFor(tab, own, browser);

  return (
    <BottomSheet open={open} onClose={onClose} title="Instalar Kobo">
      <div className={styles.sheet}>
        <p className={styles.intro}>
          Kobo es una app instalable: se abre a pantalla completa desde tu pantalla de inicio,
          arranca sin conexión y no depende de ninguna tienda de aplicaciones.
        </p>

        {installed ? (
          <p className={styles.done}>
            <span aria-hidden>✓</span> Ya la tienes instalada en este dispositivo.
          </p>
        ) : null}

        {canPrompt && own ? (
          <div className={styles.quick}>
            <p className={styles.quickText}>Aquí puedes instalarla directamente:</p>
            <Button variant="accent" block onClick={() => void promptInstall()}>
              Instalar ahora
            </Button>
          </div>
        ) : null}

        <Segmented options={TABS} value={tab} onChange={setTab} label="Dispositivo" />

        <ol className={styles.steps}>
          {steps.map((step, i) => (
            <li key={i} className={styles.step}>
              <span className={styles.num} aria-hidden>
                {i + 1}
              </span>
              <span className={styles.stepText}>
                {step.text}
                {step.icon ? <span className={styles.stepIcon}>{step.icon}</span> : null}
              </span>
            </li>
          ))}
        </ol>

        <p className={styles.note}>{noteFor(tab)}</p>

        {!own ? (
          <p className={styles.note}>
            Abre <strong>{window.location.host}</strong> en ese dispositivo para seguir estos pasos.
          </p>
        ) : null}

        {own && isInAppBrowser() ? (
          <p className={styles.warn} role="note">
            Estás viendo Kobo dentro de otra app. Desde aquí no se puede instalar: abre esta
            dirección en tu navegador ({window.location.host}) y vuelve a intentarlo.
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
