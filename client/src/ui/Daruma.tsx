import { useId } from 'react';
import { cx } from '../lib/cx';

interface DarumaProps {
  /** Lado en px (el SVG es cuadrado). Mínimo útil: 16. */
  size?: number;
  /**
   * Segundo ojo pintado. En el daruma se pinta un ojo al fijarse la meta y el otro al
   * cumplirla: reservado al mes cerrado dentro de presupuesto, nunca por defecto.
   */
  logrado?: boolean;
  /** Silueta plana en `currentColor` (para sellos, estados apagados o una sola tinta). */
  mono?: boolean;
  className?: string;
}

/** Cuerpo (trazado del original de marca, error máx. 0,8 px sobre 512). */
const CUERPO =
  'M256 114.6C295.8 114.6 338.6 124.6 369.2 154.8C399.8 185 411.4 227 414.1 267.9C416.7 309.4 408.1 356.1 369.4 381.3C333.3 404.8 289.8 406.5 256 406.5C222.3 406.5 178.7 404.8 142.6 381.3C103.9 356.1 95.3 309.4 97.9 267.9C100.6 227 112.2 185 142.8 154.8C173.4 124.6 216.3 114.6 256 114.6Z';
/** Ranura de la hucha, en la coronilla. */
const RANURA = 'M205.5 136.5H306.5A7.5 7.5 0 0 1 306.5 151.5H205.5A7.5 7.5 0 0 1 205.5 136.5Z';
/** Ojo como elipse completa en dos arcos (para calarlo en el cuerpo con evenodd). */
const ojo = (cx: number) => `M${cx} 218A16 19 0 0 1 ${cx} 256A16 19 0 0 1 ${cx} 218Z`;

/**
 * Colores propios de la marca. Son la excepción a "cero literales" de DESIGN.md §0:
 * un logo no cambia de tono con el tema (el icono oficial es idéntico en Washi y Sumi).
 * El cuerpo sí va con los tokens de acento, que ya coinciden con el original.
 */
const RANURA_FILL = '#69291a';
const OJO_FILL = '#1b1512';
const OJO_VACIO = '#bcb7af';

/**
 * 達磨 — la marca de Kobo: daruma hucha. Un ojo pintado (meta fijada) y el otro en
 * contorno hasta cerrar el mes. Reglas de uso en DESIGN.md §18.
 */
export function Daruma({ size = 34, logrado = false, mono = false, className }: DarumaProps) {
  // `useId` evita que dos darumas en la misma página compartan el id del degradado.
  const gid = useId();

  // En mono, ranura y ojos son calados del mismo trazo: dejan ver lo que haya debajo.
  const d = mono ? CUERPO + RANURA + ojo(216) + (logrado ? ojo(296) : '') : CUERPO;

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cx(className)}
    >
      {!mono && (
        <defs>
          <linearGradient id={gid} x1="0.1" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>
      )}

      <path
        fill={mono ? 'currentColor' : `url(#${gid})`}
        fillRule={mono ? 'evenodd' : 'nonzero'}
        d={d}
      />

      {mono ? (
        // Ojo sin pintar: solo el contorno, atenuado sobre la tinta plana.
        !logrado && (
          <ellipse
            cx="296"
            cy="237"
            rx="16.5"
            ry="19.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            opacity="0.45"
          />
        )
      ) : (
        <>
          <path d={RANURA} fill={RANURA_FILL} />
          <ellipse cx="256" cy="237" rx="90" ry="62.5" fill="var(--on-accent)" />
          <ellipse cx="216" cy="237" rx="16" ry="19" fill={OJO_FILL} />
          {logrado ? (
            <ellipse cx="296" cy="237" rx="16" ry="19" fill={OJO_FILL} />
          ) : (
            <ellipse
              cx="296"
              cy="237"
              rx="16.5"
              ry="19.5"
              fill="none"
              stroke={OJO_VACIO}
              strokeWidth="6"
            />
          )}
        </>
      )}
    </svg>
  );
}
