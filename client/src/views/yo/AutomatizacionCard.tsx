import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { Account, ApiToken, Category, IngestRule } from '../../lib/types';
import { Button, Eyebrow } from '../../ui';
import { Group, Row, Hairline } from './SettingsGroup';
import { DispositivosSheet } from './DispositivosSheet';
import { DispositivoEditorSheet } from './DispositivoEditorSheet';
import { ReglasSheet } from './ReglasSheet';
import styles from './index.module.css';

/**
 * 自動 · Automatización — el pago con el móvil entra solo en Kobo.
 *
 * Dos piezas: los **dispositivos** (tokens que usa el Atajo de iOS para poder
 * escribir gastos) y las **reglas** que convierten el nombre del comercio en una
 * categoría. Sin reglas la ingesta funciona igual, pero todo cae en la categoría
 * por defecto del dispositivo (o la comodín) marcado "por revisar".
 *
 * Cada dispositivo activo tiene su fila con **la cuenta de la que descuenta y
 * su categoría por defecto**, editables sin pasar por la hoja de gestión.
 */
export function AutomatizacionCard() {
  const [tokens, setTokens] = useState<ApiToken[] | undefined>(undefined);
  const [rules, setRules] = useState<IngestRule[] | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [openDevices, setOpenDevices] = useState(false);
  const [openRules, setOpenRules] = useState(false);
  const [editing, setEditing] = useState<ApiToken | null>(null);

  const load = useCallback(() => {
    void api
      .get<ApiToken[]>('/automation/tokens')
      .then(setTokens)
      .catch(() => setTokens([]));
    void api
      .get<IngestRule[]>('/automation/rules')
      .then(setRules)
      .catch(() => setRules([]));
    // Para nombrar la cuenta y la categoría por defecto de cada dispositivo.
    void api
      .get<Account[]>('/accounts')
      .then((list) => setAccounts(Array.isArray(list) ? list : []))
      .catch(() => setAccounts([]));
    void api
      .get<Category[]>('/categories')
      .then((list) => setCats(Array.isArray(list) ? list : []))
      .catch(() => setCats([]));
  }, []);

  useEffect(load, [load]);

  const activeTokens = useMemo(() => tokens?.filter((t) => !t.revokedAt) ?? [], [tokens]);
  const activos = activeTokens.length;
  const nReglas = rules?.length ?? 0;

  /** "Revolut · por defecto Comida" — lo que hace el dispositivo, de un vistazo. */
  function deviceSummary(t: ApiToken): string {
    const account = accounts.find((a) => a.id === t.accountId);
    const category = cats.find((c) => c.id === t.defaultCategoryId);
    return [
      account ? account.name : 'Sin cuenta',
      category ? `por defecto ${category.name}` : 'por defecto la comodín',
    ].join(' · ');
  }

  return (
    <section className={styles.section} aria-labelledby="yo-automatizacion">
      <Eyebrow kanji="自動" id="yo-automatizacion" className={styles.eyebrowIndent}>
        Automatización
      </Eyebrow>

      <Group>
        {activeTokens.map((t) => (
          <Fragment key={t.id}>
            <Row title={t.label} sub={deviceSummary(t)}>
              <Button variant="ghost" onClick={() => setEditing(t)} aria-label={`Editar ${t.label}`}>
                Editar
              </Button>
            </Row>
            <Hairline />
          </Fragment>
        ))}

        <Row
          title="Dispositivos"
          sub={
            tokens === undefined
              ? 'Cargando…'
              : activos === 0
                ? 'Ninguno: los pagos no entran solos todavía'
                : `${activos} ${activos === 1 ? 'activo' : 'activos'} · añadir o borrar`
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

        <Hairline />

        {/* `.noteRow`, no `.note`: suelta en la tarjeta, `.note` no trae padding y el
            texto se pegaba a los bordes (y se salía por abajo en escritorio). */}
        <p className={styles.noteRow}>
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
      <DispositivoEditorSheet token={editing} onClose={() => setEditing(null)} onSaved={load} />
      <ReglasSheet
        open={openRules}
        rules={rules ?? []}
        onClose={() => setOpenRules(false)}
        onChanged={load}
      />
    </section>
  );
}
