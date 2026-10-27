import { useEffect, useState } from 'react';
import { Button, Daruma, IconButton, IconClose } from '../../ui';
import {
  dismissInstallOffer,
  promptInstall,
  shouldOfferInstall,
  useInstall,
} from '../../lib/install';
import { InstallSheet } from './InstallSheet';
import styles from './InstallBanner.module.css';

/** La pantalla se asienta antes de que aparezca el aviso: entrar a la vez sería un salto. */
const APARECE_MS = 900;
/** Debe casar con la animación de salida del CSS (`--dur-sheet-out`). */
const SALIDA_MS = 240;

/**
 * Aviso de instalación en el login — un recuadro pequeño y descartable que se
 * apoya en el borde inferior.
 *
 * Solo sale donde tiene sentido (`shouldOfferInstall`): en móvil, en el
 * navegador, sin la app instalada y sin un "ahora no" reciente. **No roba el
 * foco ni bloquea el formulario**: quien viene a entrar, entra; el aviso es una
 * sugerencia, no un peaje. En iPhone no hay instalación de un toque, así que
 * allí el botón abre la guía en vez de instalar.
 */
export function InstallBanner() {
  const { canPrompt, installed } = useInstall();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!shouldOfferInstall()) return;
    const t = window.setTimeout(() => setVisible(true), APARECE_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Si se instala con el aviso a la vista, deja de tener sentido al instante.
  useEffect(() => {
    if (installed) setVisible(false);
  }, [installed]);

  /* El aviso es `fixed`: no ocupa sitio en el layout y en una pantalla corta
     (iPhone SE) se comería el enlace de "crear cuenta". Se marca el `body` para
     que el login le reserve hueco solo mientras está a la vista. */
  useEffect(() => {
    if (!visible) return;
    document.body.dataset.installBanner = '1';
    return () => {
      delete document.body.dataset.installBanner;
    };
  }, [visible]);

  if (!visible || installed) return null;

  function close() {
    dismissInstallOffer();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setLeaving(true);
    window.setTimeout(() => setVisible(false), reduce ? 0 : SALIDA_MS);
  }

  async function handleInstall() {
    const outcome = await promptInstall();
    // `unavailable` = este navegador no da prompt (iOS, Firefox…): a la guía.
    if (outcome === 'unavailable') setSheetOpen(true);
    // Si dijo que no al diálogo del sistema, el aviso se retira: repetir la
    // oferta justo después de un "no" es exactamente lo que molesta de esto.
    else if (outcome === 'dismissed') close();
  }

  return (
    <>
      <aside
        className={leaving ? `${styles.banner} ${styles.leaving}` : styles.banner}
        aria-label="Instalar Kobo"
      >
        <div className={styles.row}>
          <Daruma size={34} />
          <div className={styles.text}>
            <p className={styles.title}>Instala Kobo</p>
            <p className={styles.sub}>
              Añádela a tu pantalla de inicio: se abre a pantalla completa y arranca sin conexión.
            </p>
          </div>
          <IconButton label="Ahora no" onClick={close}>
            <IconClose />
          </IconButton>
        </div>

        <Button
          variant="accent"
          block
          onClick={canPrompt ? () => void handleInstall() : () => setSheetOpen(true)}
        >
          {canPrompt ? 'Instalar' : 'Ver cómo se hace'}
        </Button>
      </aside>

      <InstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
