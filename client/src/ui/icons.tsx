import type { SVGProps } from 'react';

/**
 * Iconos SVG inline (24px, `stroke=currentColor`, sin relleno duro).
 * Decorativos por defecto (`aria-hidden`): la etiqueta accesible va en el control que los envuelve.
 */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 24, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

/** Taller (home): casa artesanal. */
export function IconTaller(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M10 19.5v-5h4v5" />
    </svg>
  );
}

/** Gastos: recibo. */
export function IconGastos(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3V3.5Z" />
      <path d="M9 8h6M9 11.5h6M9 15h4" />
    </svg>
  );
}

/** Cuentas: cartera / banco. */
export function IconCuentas(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11A1.5 1.5 0 0 1 18 7v1" />
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <path d="M15 13.5h3.5" />
    </svg>
  );
}

/** Meses: calendario. */
export function IconMeses(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </svg>
  );
}

/** Yo: persona. */
export function IconYo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

/** Añadir: +. */
export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Chevron hacia abajo (selector de mes). */
export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9.5 12 15l6-5.5" />
    </svg>
  );
}

/** Chevron izquierda (mes anterior). */
export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 6 8.5 12l6 6" />
    </svg>
  );
}

/** Chevron derecha (mes siguiente). */
export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 6 15.5 12l-6 6" />
    </svg>
  );
}

/** Cerrar: ✕. */
export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Check: ✓. */
export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

/** Compartir (iOS): caja con flecha saliendo por arriba. Es el botón que abre
 *  "Añadir a pantalla de inicio", así que se dibuja igual que el del sistema. */
export function IconShare(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v11" />
      <path d="M8.5 7 12 3.5 15.5 7" />
      <path d="M6.5 11H5.5v9.5h13V11h-1" />
    </svg>
  );
}

/** Menú de tres puntos (⋮) del navegador en Android. */
export function IconDots(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={2.4}>
      <path d="M12 5.5v.01M12 12v.01M12 18.5v.01" />
    </svg>
  );
}

/** Instalar: pantalla con una flecha entrando. */
export function IconInstall(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v9" />
      <path d="M8.5 9 12 12.5 15.5 9" />
      <path d="M5 15.5v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** Añadir a pantalla de inicio: cuadrado con un +. */
export function IconAddToHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}
