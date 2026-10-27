import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
  type NotificationPrefs,
  type PushConfig,
} from '../../lib/push';
import { Button, Chip, ChipGroup, Eyebrow, Toggle } from '../../ui';
import { InstallSheet } from '../../features/install/InstallSheet';
import { BlockRow, Group, Row, Hairline } from './SettingsGroup';
import styles from './index.module.css';

const INGEST_OPTIONS: { value: NotificationPrefs['ingest']; label: string }[] = [
  { value: 'none', label: 'Nunca' },
  { value: 'review', label: 'Sin clasificar' },
  { value: 'all', label: 'Todos' },
];

/** Horas ofrecidas para el recordatorio: las que tienen sentido para cerrar el día. */
const HOURS = [18, 19, 20, 21, 22, 23];

/**
 * 通知 · Notificaciones — avisos al móvil.
 *
 * Dos cosas distintas que la UI mantiene separadas a propósito: el **permiso de
 * este dispositivo** (activar/desactivar aquí, en este navegador) y **qué avisos
 * quieres** (preferencia de la cuenta, compartida por todos tus dispositivos).
 */
export function NotificacionesCard() {
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Estado propio del envío de prueba: si comparte `busy` con el interruptor,
  // activar las notificaciones pone el botón "Enviar" a girar sin motivo.
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [installOpen, setInstallOpen] = useState(false);

  const support = pushSupport();

  const load = useCallback(() => {
    void api
      .get<PushConfig>('/push/config')
      .then((cfg) => {
        setConfig(cfg);
        setPrefs(cfg?.prefs ?? null);
      })
      .catch(() => setConfig(null));
    void currentSubscription().then((sub) => setSubscribed(Boolean(sub)));
  }, []);

  useEffect(load, [load]);

  async function toggleDevice(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (next) {
        if (!config?.publicKey) throw new Error('El servidor no tiene las notificaciones configuradas.');
        await enablePush(config.publicKey);
        setStatus('Notificaciones activadas en este dispositivo.');
      } else {
        await disablePush();
        setStatus('Notificaciones desactivadas en este dispositivo.');
      }
      setSubscribed(next);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el ajuste.');
    } finally {
      setBusy(false);
    }
  }

  async function savePrefs(patch: Partial<NotificationPrefs>) {
    const previous = prefs;
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    try {
      const saved = await api.patch<NotificationPrefs>('/push/prefs', patch);
      if (saved) setPrefs(saved);
    } catch (err) {
      // Revierte el optimismo: mejor mostrar el estado real que uno inventado.
      setPrefs(previous);
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la preferencia.');
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    try {
      await api.post('/push/test');
      setStatus('Notificación de prueba enviada.');
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === 'no_devices'
          ? 'No hay ningún dispositivo activado todavía.'
          : 'No se pudo enviar la notificación de prueba.',
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="yo-notificaciones">
      <Eyebrow kanji="通知" id="yo-notificaciones" className={styles.eyebrowIndent}>
        Notificaciones
      </Eyebrow>

      <Group>
        {support.ok !== true && support.reason === 'needs-install' ? (
          /* Las instrucciones no se repiten aquí en prosa: hay una sola guía
             (`InstallSheet`) y desde este callejón se abre la misma. */
          <Row
            title="Instala Kobo primero"
            sub="En el iPhone los avisos solo llegan con la app en la pantalla de inicio."
          >
            <Button variant="ghost" onClick={() => setInstallOpen(true)}>
              Cómo
            </Button>
          </Row>
        ) : support.ok !== true ? (
          <p className={styles.noteRow}>Este navegador no admite notificaciones push.</p>
        ) : config && !config.enabled ? (
          <p className={styles.noteRow}>
            El servidor no tiene configuradas las claves de notificación (VAPID), así que los avisos
            están desactivados.
          </p>
        ) : (
          <>
            <Row
              title="En este dispositivo"
              sub={
                subscribed
                  ? config && config.devices > 1
                    ? `Activado · ${config.devices} dispositivos en total`
                    : 'Activado'
                  : 'Desactivado'
              }
            >
              <Toggle
                checked={subscribed}
                disabled={busy}
                onChange={(v) => void toggleDevice(v)}
                label="Notificaciones en este dispositivo"
              />
            </Row>

            {subscribed && prefs ? (
              <>
                <Hairline />

                <BlockRow
                  title="Avisar de un gasto"
                  sub="Cuando un pago entra solo desde el móvil"
                >
                  <ChipGroup label="Cuándo avisar de un gasto">
                    {INGEST_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.value}
                        selected={prefs.ingest === opt.value}
                        onClick={() => void savePrefs({ ingest: opt.value })}
                      >
                        {opt.label}
                      </Chip>
                    ))}
                  </ChipGroup>
                </BlockRow>

                <Hairline />

                <Row
                  title="Recordatorio de fin de día"
                  sub="Para apuntar lo que no entró solo (efectivo, tarjeta física)"
                >
                  <Toggle
                    checked={prefs.dailyReminder}
                    onChange={(v) => void savePrefs({ dailyReminder: v })}
                    label="Recordatorio de fin de día"
                  />
                </Row>

                {prefs.dailyReminder ? (
                  <BlockRow title="Hora del recordatorio" child>
                    <ChipGroup label="Hora del recordatorio">
                      {HOURS.map((h) => (
                        <Chip
                          key={h}
                          selected={prefs.dailyHour === h}
                          onClick={() => void savePrefs({ dailyHour: h })}
                        >
                          {h}:00
                        </Chip>
                      ))}
                    </ChipGroup>
                  </BlockRow>
                ) : null}

                <Hairline />

                <Row title="Probar" sub="Envía un aviso ahora mismo a este dispositivo">
                  <Button variant="ghost" loading={testing} onClick={() => void sendTest()}>
                    Enviar
                  </Button>
                </Row>
              </>
            ) : null}
          </>
        )}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {/* El aviso de "hecho" se ve además de anunciarse: en el móvil, tras
            pulsar "Enviar" no hay otra señal de que algo haya pasado hasta que
            (y si) llega la notificación. La región vive siempre montada para
            que el lector de pantalla la siga anunciando. */}
        <p
          className={status && !error ? styles.noteRow : 'visually-hidden'}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      </Group>

      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
    </section>
  );
}
