/**
 * Bloqueo del scroll del fondo mientras hay una hoja/diálogo abierto.
 *
 * En iOS (incluida la PWA standalone) un `<dialog>` abierto con `showModal()` NO
 * bloquea el scroll del documento: el fondo sigue desplazándose y el navegador
 * pinta la capa `position: fixed` / top-layer con un offset de scroll rancio, así
 * que la hoja aparece "muy arriba" y con scroll de más hasta que un evento de
 * scroll fuerza el repintado. La técnica fiable en iOS es sacar el `body` del
 * flujo con `position: fixed` y compensar con `top: -scrollY` (así no salta), y
 * restaurar el scroll exacto al desbloquear.
 *
 * NO añadimos `overflow: hidden`: `position: fixed` ya corta el scroll del
 * documento por sí solo, y como el proyecto fija `html, body, #root { height:100% }`
 * (tokens.css), un `overflow:hidden` clavaría la caja del body a 1×viewport y
 * recortaría la franja inferior del fondo (mostrando `--bg` plano) al abrir una
 * hoja con la página ya scrolleada.
 *
 * Con recuento de referencias: soporta varias hojas solapadas sin desbloquear
 * antes de tiempo ni perder la posición de scroll.
 */
let locks = 0;
let savedScrollY = 0;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (locks === 0) {
    savedScrollY = window.scrollY;
    // Ancho de la barra de scroll del documento. Al sacar el `body` del flujo la
    // barra desaparece y, sin compensar, el ancho útil crece de golpe y todo el
    // contenido se re-maqueta a lo ancho (salto visible en escritorio). Se
    // compensa solo mientras dura el bloqueo: nada de reservar el hueco de forma
    // permanente con `scrollbar-gutter`, que deja una barra muerta a la vista.
    // En móvil las barras son overlay y esto vale 0.
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const { style } = document.body;
    style.position = 'fixed';
    style.top = `-${savedScrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    if (gutter > 0) style.paddingRight = `${gutter}px`;
  }
  locks += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (locks === 0) return;
  locks -= 1;
  if (locks === 0) {
    const { style } = document.body;
    style.position = '';
    style.top = '';
    style.left = '';
    style.right = '';
    style.width = '';
    style.paddingRight = '';
    // Restaura la posición exacta (el body vuelve al flujo con su scroll previo).
    window.scrollTo(0, savedScrollY);
  }
}
