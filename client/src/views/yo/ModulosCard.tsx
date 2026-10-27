import { Fragment, useState } from 'react';
import { Eyebrow, Switch } from '../../ui';
import { Group, Hairline, Row } from './SettingsGroup';
import { readModules, writeModule, type ModuleKey } from './modulesStore';
import styles from './index.module.css';

const MODULES: { key: ModuleKey; title: string; sub?: string }[] = [
  { key: 'ritmo', title: 'Ritmo del mes', sub: 'Gráfico de gasto acumulado por día' },
  { key: 'comparativa', title: 'Comparativa con el mes anterior' },
  { key: 'sinAsignar', title: 'Tarjeta «sin asignar»', sub: 'Avisa si queda nómina sin repartir' },
];

/** Módulos del panel — toggles persistidos en localStorage (v1). */
export function ModulosCard() {
  const [modules, setModules] = useState(readModules);

  function toggle(key: ModuleKey, value: boolean) {
    writeModule(key, value);
    setModules((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className={styles.section} aria-labelledby="yo-modulos">
      <Eyebrow id="yo-modulos" className={styles.eyebrowIndent}>
        Módulos del panel
      </Eyebrow>
      <Group>
        {MODULES.map((m, i) => (
          <Fragment key={m.key}>
            {i > 0 ? <Hairline /> : null}
            <Row title={m.title} sub={m.sub}>
              <Switch checked={modules[m.key]} onChange={(v) => toggle(m.key, v)} label={m.title} />
            </Row>
          </Fragment>
        ))}
      </Group>
    </section>
  );
}
