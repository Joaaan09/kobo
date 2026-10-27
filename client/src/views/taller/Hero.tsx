import { useCallback, useRef, useState, type ReactNode } from 'react';
import { formatBp, formatEuros } from '../../lib/money';
import { cx } from '../../lib/cx';
import { Eyebrow, Money } from '../../ui';
import type { DashboardSummary } from '../../lib/types';
import { AllocationBar } from './AllocationBar';
import { monthBudgetKanji } from './monthKanji';
import styles from './Hero.module.css';

interface HeroProps {
  data: DashboardSummary;
  /** Mes activo `YYYY-MM`, para el sello vertical. */
  month: string;
}

/** Cifra enorme en Mincho, partida en entero + céntimos. Roja si es negativa. */
function Amount({ cents, label }: { cents: number; label: string }) {
  const formatted = formatEuros(cents);
  const comma = formatted.indexOf(',');
  const integer = comma >= 0 ? formatted.slice(0, comma) : formatted;
  const fraction = comma >= 0 ? formatted.slice(comma) : '';
  return (
    <p className={cx(styles.amount, cents < 0 && styles.amountNeg)} aria-label={`${label}: ${formatted}`}>
      <span>{integer}</span>
      <span className={styles.cents}>{fraction}</span>
    </p>
  );
}

interface Slide {
  key: string;
  label: string;
  cents: number;
  body: ReactNode;
}

/**
 * Hero del Taller: carrusel de tres resúmenes del mes que se deslizan (scroll-snap
 * nativo, un punto por lámina). Son tres números independientes:
 *  1. **Queda por gastar** — presupuesto del mes (nómina − gasto − ahorro − fondos).
 *  2. **Restante del mes** — caja real (nómina + ingresos sueltos − gasto total).
 *  3. **Patrimonio total** — tu dinero real acumulado en todas las cuentas.
 */
export function Hero({ data, month }: HeroProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const slides: Slide[] = [
    {
      key: 'queda',
      label: 'Queda por gastar',
      cents: data.quedaPorGastarCents,
      body: (
        <>
          <AllocationBar categories={data.categories} sinAsignarCents={data.sinAsignarCents} />
          <p className={styles.meta}>
            <span>
              Nómina <Money cents={data.nominaCents} />
            </span>
            <span className={styles.sep} aria-hidden />
            <span>{formatBp(data.repartidoBp)} repartido</span>
          </p>
        </>
      ),
    },
    {
      key: 'restante',
      label: 'Restante del mes',
      cents: data.restanteMesCents,
      body: (
        <p className={styles.meta}>
          <span>
            Ingresos <Money cents={data.ingresosExtraCents} />
          </span>
          <span className={styles.sep} aria-hidden />
          <span>
            Gastos −<Money cents={data.gastadoConFondosCents} />
          </span>
        </p>
      ),
    },
    {
      key: 'patrimonio',
      label: 'Patrimonio total',
      cents: data.patrimonioTotalCents,
      body: <p className={styles.meta}>Tu dinero real, en todas tus cuentas</p>,
    },
  ];

  // El punto activo se deriva de la posición del scroll (redondeo al ancho de lámina).
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive((prev) => (prev === idx ? prev : idx));
  }, []);

  const goTo = (idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    // Sin `behavior`: respeta `scroll-behavior` del CSS (auto con reduce-motion).
    el.scrollTo({ left: idx * el.clientWidth });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(Math.min(slides.length - 1, active + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(Math.max(0, active - 1));
    }
  };

  return (
    <section
      className={styles.hero}
      aria-roledescription="carrusel"
      aria-label="Resumen del mes"
    >
      <span className={styles.glow} aria-hidden />
      <span className={styles.kanji} aria-hidden>
        {monthBudgetKanji(month)}
      </span>

      <div className={styles.track} ref={trackRef} onScroll={onScroll} onKeyDown={onKeyDown}>
        {slides.map((s, i) => (
          <article
            key={s.key}
            className={styles.slide}
            aria-hidden={i !== active}
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${slides.length}: ${s.label}`}
          >
            <Eyebrow>{s.label}</Eyebrow>
            <Amount cents={s.cents} label={s.label} />
            {s.body}
          </article>
        ))}
      </div>

      <div className={styles.dots} role="group" aria-label="Elegir resumen del mes">
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={cx(styles.dot, i === active && styles.dotActive)}
            aria-label={s.label}
            aria-current={i === active}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </section>
  );
}
