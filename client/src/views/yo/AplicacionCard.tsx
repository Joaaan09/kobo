import { useState } from 'react';
import { Button, Eyebrow, IconCheck } from '../../ui';
import { isStandalone, promptInstall, useInstall } from '../../lib/install';
import { InstallSheet } from '../../features/install/InstallSheet';
import { Group, Hairline, Row } from './SettingsGroup';
import styles from './index.module.css';

/**
 * アプリ · La app — instalar Kobo en la pantalla de inicio.
 *
 * Dos caminos según lo que permita el navegador: **prompt nativo** de un toque
 * (Chromium) o **guía manual** (iPhone y cualquiera sin prompt). La fila de
 * instrucciones está siempre, incluso con la app ya instalada: sirve para
 * ponerla en el *otro* dispositivo, que es el caso real más frecuente.
 */
export function AplicacionCard() {
  const { canPrompt, installed } = useInstall();
  const [sheetOpen, setSheetOpen] = useState(false);

  async function handleInstall() {
    // Sin prompt disponible (o rechazado por el navegador): a la guía manual.
    const outcome = await promptInstall();
    if (outcome === 'unavailable') setSheetOpen(true);
  }

  return (
    <section className={styles.section} aria-labelledby="yo-app">
      <Eyebrow kanji="アプリ" id="yo-app" className={styles.eyebrowIndent}>
        La app
      </Eyebrow>

      <Group>
        {installed ? (
          <Row
            title="Instalada"
            sub={
              isStandalone()
                ? 'Estás usando la app instalada.'
                : 'Ábrela desde tu pantalla de inicio.'
            }
          >
            <span className={styles.installedBadge}>
              <IconCheck size={16} />
              Lista
            </span>
          </Row>
        ) : (
          <Row
            title="Instalar en este dispositivo"
            sub="Pantalla completa, sin barra del navegador, y arranca sin conexión."
          >
            <Button
              variant={canPrompt ? 'accent' : 'ghost'}
              onClick={canPrompt ? () => void handleInstall() : () => setSheetOpen(true)}
            >
              {canPrompt ? 'Instalar' : 'Cómo'}
            </Button>
          </Row>
        )}

        <Hairline />

        <Row title="Instrucciones" sub="iPhone, Android y ordenador">
          <Button variant="ghost" onClick={() => setSheetOpen(true)}>
            Ver
          </Button>
        </Row>
      </Group>

      <InstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </section>
  );
}
