import { useTheme } from '../../theme/ThemeProvider';
import type { ThemePref } from '../../lib/types';
import { Eyebrow, Segmented, Switch } from '../../ui';
import styles from './index.module.css';

/** Apariencia — tema (Washi / Sumi / Auto) y "Cifras en Mincho". */
export function AparienciaCard() {
  const { theme, setTheme, resolvedTheme, mincho, setMincho, navKanji, setNavKanji } = useTheme();

  return (
    <section className={styles.section} aria-labelledby="yo-apariencia">
      <Eyebrow id="yo-apariencia" className={styles.eyebrowIndent}>
        Apariencia
      </Eyebrow>
      <div className={styles.appearanceGroup}>
        <Segmented<ThemePref>
          label="Tema de la aplicación"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'washi', label: 'Washi' },
            { value: 'sumi', label: 'Sumi' },
            { value: 'auto', label: 'Auto' },
          ]}
        />
        {theme === 'auto' && (
          <p className={styles.appearanceHint}>
            Sigue al sistema · ahora {resolvedTheme === 'sumi' ? '墨 Sumi' : '和紙 Washi'}
          </p>
        )}
        <div className={styles.appearanceRow}>
          <span className={styles.appearanceLabel}>Cifras en Mincho</span>
          <Switch checked={mincho} onChange={setMincho} label="Cifras en Mincho" />
        </div>
        <div className={styles.appearanceRow}>
          <span className={styles.appearanceLabelStack}>
            <span className={styles.appearanceLabel}>Kanji en la navegación</span>
            <span className={styles.appearanceSub} aria-hidden="true">
              房 記 財 月 我
            </span>
          </span>
          <Switch checked={navKanji} onChange={setNavKanji} label="Kanji en la navegación" />
        </div>
      </div>
    </section>
  );
}
