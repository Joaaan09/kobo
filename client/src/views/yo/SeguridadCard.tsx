import { useState } from 'react';
import { Button, Eyebrow } from '../../ui';
import { Group, Row } from './SettingsGroup';
import { PasswordSheet } from './PasswordSheet';
import styles from './index.module.css';

/** 安全 · Seguridad — cambio de contraseña. (El correo ya se ve en la cabecera de Yo.) */
export function SeguridadCard() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <section className={styles.section} aria-labelledby="yo-seguridad">
      <Eyebrow kanji="安全" id="yo-seguridad" className={styles.eyebrowIndent}>
        Seguridad
      </Eyebrow>

      <Group>
        <Row title="Contraseña" sub="La que usas para entrar en Kobo">
          <Button
            variant="ghost"
            onClick={() => {
              setDone(false);
              setOpen(true);
            }}
          >
            Cambiar
          </Button>
        </Row>

        {done ? (
          <p className={styles.confirmNote}>
            <span aria-hidden>✓</span> Contraseña actualizada.
          </p>
        ) : null}
        {/* Live region siempre montada: si se inserta a la vez que el texto, algunos lectores no lo anuncian. */}
        <p className="visually-hidden" role="status" aria-live="polite">
          {done ? 'Contraseña actualizada.' : ''}
        </p>
      </Group>

      <PasswordSheet
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          setOpen(false);
          setDone(true);
        }}
      />
    </section>
  );
}
