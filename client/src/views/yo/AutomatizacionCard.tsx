import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { ApiToken, IngestRule } from '../../lib/types';
import { Button, Eyebrow } from '../../ui';
import { Group, Row, Hairline } from './SettingsGroup';
import { DispositivosSheet } from './DispositivosSheet';
import { ReglasSheet } from './ReglasSheet';
import styles from './index.module.css';

/**
 * 自動 · Automatización — el pago con el móvil entra solo en Kobo.
 *
 * Dos piezas: los **dispositivos** (tokens que usa el Atajo de iOS para poder
 * escribir gastos) y las **reglas** que convierten el nombre del comercio en una
 * categoría. Sin reglas la ingesta funciona igual, pero todo cae en la categoría
 * comodín marcado "por revisar".
 */
export function AutomatizacionCard() {
  const [tokens, setTokens] = useState<ApiToken[] | undefined>(undefined);
  const [rules, setRules] = useState<IngestRule[] | undefined>(undefined);
  const [openDevices, setOpenDevices] = useState(false);
  const [openRules, setOpenRules] = useState(false);

  const load = useCallback(() => {
    void api
      .get<ApiToken[]>('/automation/tokens')
      .then(setTokens)
      .catch(() => setTokens([]));
    void api
      .get<IngestRule[]>('/automation/rules')
      .then(setRules)
      .catch(() => setRules([]));
  }, []);

  useEffect(load, [load]);

  const activos = tokens?.filter((t) => !t.revokedAt).length ?? 0;
  const nReglas = rules?.length ?? 0;

  return (
    <section className={styles.section} aria-labelledby="yo-automatizacion">
      <Eyebrow kanji="自動" id="yo-automatizacion" className={styles.eyebrowIndent}>
        Automatización
      </Eyebrow>

      <Group>
        <Row
          title="Dispositivos"
          sub={
            tokens === undefined
              ? 'Cargando…'
              : activos === 0
                ? 'Ninguno: los pagos no entran solos todavía'
                : `${activos} ${activos === 1 ? 'activo' : 'activos'}`
          }
        >
          <Button variant="ghost" onClick={() => setOpenDevices(true)}>
            Gestionar
          </Button>
        </Row>

        <Hairline />

        <Row
          title="Reglas de comercio"
          sub={
            rules === undefined
              ? 'Cargando…'
              : nReglas === 0
                ? 'Sin reglas: todo entrará por revisar'
                : `${nReglas} ${nReglas === 1 ? 'regla' : 'reglas'}`
          }
        >
          <Button variant="ghost" onClick={() => setOpenRules(true)}>
            Gestionar
          </Button>
        </Row>

        <p className={styles.note}>
          Al pagar con el iPhone, un Atajo manda el importe y el comercio a Kobo y el gasto se
          registra solo. Solo funciona con Apple&nbsp;Pay: los pagos con la tarjeta física hay que
          apuntarlos a mano.
        </p>
      </Group>

      <DispositivosSheet
        open={openDevices}
        tokens={tokens ?? []}
        onClose={() => setOpenDevices(false)}
        onChanged={load}
      />
      <ReglasSheet
        open={openRules}
        rules={rules ?? []}
        onClose={() => setOpenRules(false)}
        onChanged={load}
      />
    </section>
  );
}
