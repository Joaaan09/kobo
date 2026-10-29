# Kobo — Sistema de Diseño

> Fuente de verdad visual. **De cumplimiento obligatorio** (ver [CLAUDE.md](CLAUDE.md) §5).
> El norte son los mockups de la raíz: **`KOBO App (offline).html`** (app) y **`KOBO Logo (offline).html`**
> (marca). Ante duda, gana el mockup. Si algo visual no está aquí, **decídelo, añádelo aquí y luego implementa.**

Kobo es un **taller (工房)**: una app financiera con alma artesanal japonesa. Papel (**和紙 washi**), tinta
(**墨 sumi**), sello bermellón (**判子 hanko**) y olas sutiles (**青海波 seigaiha**). Nada de dashboard corporativo.

---

## 0. Restricciones negativas (el "nada de…")

- **Nada de colores literales** en componentes: solo tokens `--*`. Un componente debe verse bien en
  **Washi** y **Sumi** sin tocarlo.
- **Nada de Tailwind** ni utilidades de color inline. Estilos con **tokens CSS + CSS Modules**.
- **Nada de sombras duras, degradados chillones ni neón.** La elevación es suave y cálida; el acento
  es un **sello**, no un semáforo.
- **Nada de fuentes de sistema para las cifras/titulares**: las cifras van en **Shippori Mincho**.
- **Nada de esquinas a 90°** en tarjetas/controles: radios generosos (§4).
- **Nada de gráficas de librería genérica sin adaptar** a los tokens.
- **Nada de bloquear con animación**: respeta `prefers-reduced-motion` y no metas latencia por adorno.

## 1. Principios

1. **Papel y tinta.** Superficies planas de papel cálido, separadas por **bordes de 1px** y **sombra
   suave**, no por cajas fuertes. La jerarquía la dan tipografía, espacio y el sello de acento.
2. **La cifra es la heroína.** "Queda por gastar", saldos y porcentajes van grandes, en **Mincho**,
   con *letter-spacing* negativo. El dato manda.
3. **Calma con un punto de color.** Todo es neutro cálido salvo el **bermellón** del acento, que se usa
   con moderación: barras de progreso, botón principal, sello, estado activo.
4. **Móvil primero, una mano.** Objetivos táctiles cómodos, navegación abajo, hojas inferiores para
   acciones. Se diseña a **402 × 874** y escala.
5. **Dos pieles, un alma.** Washi (claro) y Sumi (oscuro) comparten estructura y tokens; solo cambian valores.

## 2. Tipografía

- **Display / cifras / titulares** → **Shippori Mincho** (serif japonés). Autoalojada (`@fontsource/shippori-mincho`),
  pesos 500/600/700. Es el héroe: hero de "queda por gastar", importes, `Agosto ▾`, títulos de sección.
  El ajuste **"Cifras en Mincho"** (Ajustes) permite volver las cifras a sans; por defecto **ON**.
- **UI / cuerpo / labels** → **system sans**: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`.
- **Kanji de sección** (給料, 分類, 設定, 工房) → Shippori Mincho, como *eyebrow* junto al título en español.
- **Datos técnicos que se copian** (token de ingesta, URL del endpoint) → **mono del sistema**. Único
  uso legítimo de la monoespaciada: cadenas que el usuario compara carácter a carácter, donde
  distinguir `0`/`O` o `l`/`1` importa. **Nunca** para importes, etiquetas ni texto de UI.

Tokens de fuente:

```css
--font-display: 'Shippori Mincho', Georgia, 'Times New Roman', serif;
--font-ui: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
```

**Escala** (px del mockup): hero `58` · título grande `22` · título `19` · cuerpo fuerte `16` · cuerpo `15`
· secundario `14` / `13.5` / `13` · label `12` / `12.5` · micro `11.5` / `11` / `10.5` / `10`.
**Tracking**: display negativo (`-0.02em`…`-0.015em`); *eyebrows* en mayúsculas positivo y amplio
(`0.08em`…`0.16em`, hasta `0.35em` en micro-labels tipo `MÓDULO`). Peso: 400 cuerpo, 600 énfasis/labels.

## 3. Color — tokens + los 2 temas

**Regla**: usa **solo** los tokens semánticos. Los valores literales viven aquí (y en el `:root`/`[data-theme]`),
en ningún otro sitio. Tema por atributo en `<html data-theme="washi|sumi">`; "Auto" = `prefers-color-scheme`.

### Tokens semánticos

```css
/* Superficies */
--bg            /* fondo base de la app */
--surface       /* tarjeta / hoja */
--surface-2     /* superficie secundaria / input */
--surface-glass /* fondo de cabecera y nav (con blur) */
--accent-tint   /* fondo suave teñido de acento (chips, resaltados) */

/* Texto (tinta) */
--ink           /* texto principal */
--ink-2         /* secundario (~0.75) */
--ink-3         /* terciario / muted (~0.55) */
--ink-4         /* débil / eyebrow (~0.42) */
--on-accent     /* texto sobre el acento */

/* Líneas y acento */
--border        /* borde/hairline 1px */
--border-strong /* borde más marcado */
--accent        /* bermellón base */
--accent-2      /* bermellón claro (fin del degradado) */
--accent-strong /* bermellón profundo (inicio del degradado / pressed) */
--accent-grad   /* linear-gradient(160deg, ...) para botón/sello */
--accent-glow   /* color del glow del acento */

/* Elevación */
--shadow-card   /* tarjeta */
--shadow-raised /* tarjeta elevada / hoja */
--shadow-glow   /* glow del acento */
```

### 和紙 Washi (claro — por defecto). Valores exactos del mockup

```css
[data-theme='washi'] {
  --bg:            #f1eee9;
  --surface:       #fcfaf6;
  --surface-2:     #f7f3ec;
  --surface-glass: rgba(252,250,246,0.72);
  --accent-tint:   #fff4ef;

  --ink:    #1b1815;
  --ink-2:  rgba(27,24,21,0.75);
  --ink-3:  rgba(27,24,21,0.55);
  --ink-4:  rgba(27,24,21,0.42);
  --on-accent: #fff6f2;

  --border:        rgba(27,24,21,0.10);   /* ~ #dedad2 */
  --border-strong: rgba(27,24,21,0.16);   /* ~ #c9c3ba */

  --accent:        #c9553b;
  --accent-2:      #e0664a;
  --accent-strong: #98301b;
  --accent-grad:   linear-gradient(160deg, #c0472e, #98301b);
  --accent-glow:   rgba(224,102,74,0.55);

  --shadow-card:   0 1px 1px rgba(27,24,21,0.04), 0 10px 24px -16px rgba(27,24,21,0.18);
  --shadow-raised: 0 1px 1px rgba(27,24,21,0.05), 0 14px 30px -18px rgba(27,24,21,0.22);
  --shadow-glow:   0 0 18px -4px var(--accent-glow);
}
```

### 墨 Sumi (oscuro). Valores exactos del mockup

```css
[data-theme='sumi'] {
  --bg:            #14110f;
  --surface:       #1f1b18;                /* tarjeta; alt. degradado 160deg #35302a→#16130f */
  --surface-2:     #241f1a;
  --surface-glass: rgba(20,17,15,0.62);
  --accent-tint:   #2a1215;

  --ink:    #f1eee9;
  --ink-2:  rgba(241,238,233,0.80);
  --ink-3:  rgba(241,238,233,0.55);
  --ink-4:  rgba(241,238,233,0.42);
  --on-accent: #fff6f2;

  --border:        rgba(241,238,233,0.10);
  --border-strong: rgba(241,238,233,0.16);

  --accent:        #d3573c;
  --accent-2:      #e0664a;
  --accent-strong: #a5361d;
  --accent-grad:   linear-gradient(160deg, #d3573c, #a5361d);
  --accent-glow:   rgba(224,102,74,0.60);

  --shadow-card:   0 1px 2px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.03);
  --shadow-raised: 0 2px 4px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04);
  --shadow-glow:   0 0 18px -4px var(--accent-glow);
}
```

### Datos y estados (mapea a tokens)

- **Barra de progreso de categoría**: pista `--surface-2`; relleno `--accent-grad`; si **supera el límite**,
  el relleno vira a un rojo de alarma (`--accent-strong`) + micro-aviso.
- **"Sin asignar"**: chip/tarjeta en `--accent-tint` con texto `--accent`; avisa si queda nómina sin repartir.
- **Positivo/ahorro** puede usar un verde cálido derivado; **defínelo aquí antes de usarlo** (no lo hay aún en el mockup).

## 4. Espaciado, radios, bordes, elevación, glass, glow

```css
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 20px; --space-6: 24px; --space-8: 32px;

--r-xs: 3px;   /* chips/hairline diminutos */
--r-sm: 6px;   /* controles pequeños */
--r-md: 12px;  /* inputs, botones */
--r-lg: 22px;  /* tarjetas (radio canónico) */
--r-xl: 26px;  /* tarjetas grandes / hojas */
--r-pill: 99px;/* píldoras, chips, toggles, avatar, botón "+ Añadir gasto" */
```

- **Bordes**: 1px sólido `--border`. Separan superficies; nunca cajas pesadas.
- **Elevación**: `--shadow-card` en tarjetas, `--shadow-raised` en elementos flotantes/hojas. Suave y cálida.
- **Glass**: cabecera y barra inferior usan `background: --surface-glass` + `backdrop-filter: blur(20px) saturate(160%)`
  (`18–24px` según componente). Fallback sólido si no hay soporte.
- **Glow**: solo el acento (botón principal, sello activo): `box-shadow: --shadow-glow`. Con moderación.

## 5. Shell móvil — marco, cabecera y navegación

- **Marco**: contenido en columna, `max-width` de móvil centrado, `padding` lateral `--space-4`,
  respeta `env(safe-area-inset-*)` (PWA standalone).
- **Cabecera** (sticky, glass): wordmark **KOBO** (Mincho) a la izquierda; **selector de mes** `Agosto ▾`
  (abre hoja de meses); a la derecha, acceso a perfil/tema si aplica.
- **Barra inferior** (fija, glass, con safe-area): **4 destinos** con icono + label, estado activo en
  `--accent`, inactivo en `--ink-3`. Orden: **Taller · Gastos · Meses · Yo**. La acción **"+ Añadir gasto"**
  es un botón-píldora de acento (puede ir como FAB centrado o dentro del Taller).

## 6. Vista Taller (la estrella)

Panel del mes. De arriba a abajo:

1. **Hero — carrusel de 3 resúmenes** (deslizable, scroll-snap nativo, un punto por lámina; puntos con
   objetivo táctil de 24px, `aria-current`, teclas ←/→, `prefers-reduced-motion` respetado). Cifra enorme
   en Mincho (`~58px`, tracking negativo); negativa → acento. Las tres son números **independientes**:
   - **① Queda por gastar** (por defecto): presupuesto del mes = `nómina − gasto − ahorro − reserva de
     fondos`. Debajo: barra de asignación + `Nómina 2.450 €` · `95 % repartido`.
   - **② Restante del mes** (caja real): `nómina + ingresos sueltos − gasto total (incl. pagos de fondo)`.
     El ahorro **no** resta aquí (sigue siendo tuyo). Debajo: `Ingresos +X` · `Gastos −Y`.
   - **③ Patrimonio total**: suma de todos los saldos de tus cuentas (mismo dato que el hero de Cuentas).
   Es lo primero que se lee. Láminas ① y ② son **flujo del mes**; ③ es **stock** (patrimonio).
2. **Módulo "Ritmo del mes"** (*eyebrow* `MÓDULO`): timeline `1 ago — hoy — 31` con marca de dónde
   deberías ir vs dónde vas; resumen tipo `52 % en 10 días`. Activable en Ajustes → Módulos del panel.
   Otros módulos opcionales: **gasto acumulado por día**, **comparativa con el mes anterior**, **tarjeta
   "sin asignar"**.
3. **Sección "Categorías"** con cabecera `gastado / asignado`: lista de tarjetas de categoría (§7) y pie
   `N categorías · XX,XX € libres`.
4. **"+ Añadir gasto"**: botón-píldora de acento (§8).

## 7. Componente Categoría (con subcategorías)

Tarjeta (`--r-lg`, `--surface`, `--shadow-card`):

- **Cabecera**: punto/emoji o inicial en color de la categoría · nombre (`Vivienda`, `Comida`, `Ocio`,
  `Ahorro e inversión`) · a la derecha, `gastado / asignado` en Mincho (`186 / 400 €`).
- **Barra de progreso**: `--accent-grad` sobre `--surface-2`; si `gastado > asignado` (o supera límite),
  alarma visual + aviso. El % se puede mostrar al lado.
- **Subcategorías**: línea muted bajo la barra, p. ej. `Súper 186 · Restaurantes 55`. Al expandir, cada
  subcategoría con su propio mini-progreso y `limit?` opcional.
- **Reparto por %**: en Ajustes → Categorías se editan los porcentajes (deben tender a 100 %); lo que falte
  es "sin asignar".

## 8. Añadir gasto (hoja inferior)

- Se abre desde el botón-píldora de acento. **Hoja inferior** (`--r-xl` arriba, `--shadow-raised`, glass de fondo).
- Campos: **importe** (teclado numérico, cifra grande en Mincho), **categoría** (chips), **subcategoría**
  (chips dependientes), **fecha** (por defecto hoy), **nota** opcional.
- Guardar = botón de acento a ancho completo; feedback inmediato (la barra de la categoría se actualiza).
- Importes **en céntimos** en el modelo; formateo a `€` solo en la vista (ver [CLAUDE.md](CLAUDE.md) §9).

## 9. Vista Gastos

Registro/historial de gastos: lista cronológica agrupada por día, cada fila con categoría (color),
subcategoría, nota e importe (Mincho). Filtros por categoría/subcategoría y rango de fechas. Editar/borrar
gasto desde la fila (swipe o menú). Reutiliza tarjetas y chips del sistema.

## 10. Vista Meses

Histórico por mes: para cada mes, presupuesto (nómina vigente), total gastado, % usado y **comparativa con
el mes anterior**. Un mes abre su detalle (mismo layout que Taller pero de solo lectura para meses pasados).
Cambios de nómina/porcentajes aplican **desde el mes siguiente**: el pasado no se recalcula.

## 11. Vista Yo / Ajustes

- **Yo**: perfil, tema rápido, acceso a Ajustes, cerrar sesión.
- **Ajustes** (設定), en secciones con *eyebrow* kanji:
  - **給料 · Nómina**: Tipo (`Fija` / `Variable`), Importe (Mincho), Día de ingreso, nota "se aplica desde
    el mes siguiente".
  - **Módulos del panel**: toggles de gasto acumulado, comparativa, tarjeta "sin asignar".
  - **分類 · Categorías**: reparto por %, gestión de categorías/subcategorías, aviso al superar el límite.
  - **Apariencia**: **Washi / Sumi / Auto** y toggles **"Cifras en Mincho"** y **"Kanji en la navegación"** (§17).

## 12. Motivos japoneses (con mesura)

- **達磨 Daruma hucha (la marca)**: el símbolo de Kobo. Va **desnudo**, sin disco ni caja detrás (§18).
- **判子 Hanko (sello bermellón)**: el degradado de acento + glow sobre superficie circular, como recurso
  de énfasis (estado activo, botón principal). **Ya no envuelve a la marca**: metido en un disco, el
  daruma pierde un 38 % de tamaño y a 30 px deja de leerse. Es el único elemento con glow.
- **青海波 Seigaiha (olas)**: patrón decorativo **muy sutil** (≈4 % de opacidad) en fondos de Sumi. Opcional,
  nunca compite con el contenido.
- **和紙 Washi (papel)**: textura de papel apenas perceptible en superficies claras si aporta calidez.
- Kanji como *eyebrows* de sección. **Regla**: decoración japonesa = acento silencioso; si estorba la
  lectura de una cifra, sobra.

## 13. Movimiento

- **Rápido y suave**: transiciones `140–220ms`, easing `cubic-bezier(0.22, 0.61, 0.36, 1)` (salida) /
  `ease` corto en hover/press. Nada por encima de ~300ms salvo hojas.
- **Tokens de movimiento** (`tokens.css`, úsalos en vez de literales nuevos):
  | Token | Valor | Para qué |
  | --- | --- | --- |
  | `--ease-out` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | por defecto: entradas, salidas, press |
  | `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | **solo hojas**: arranque decidido, frenada larga |
  | `--dur-1` | `140ms` | press, hover, cambios de color (la duración por defecto) |
  | `--dur-2` | `200ms` | despliegues in-situ (chevrón, `reveal` de subcategorías) |
  | `--dur-sheet-in` | `340ms` | entrada de hoja |
  | `--dur-sheet-out` | `240ms` | salida de hoja |
- **Hojas inferiores**: entran deslizando desde abajo con `--ease-drawer`, **sin rebote**, y el velo del
  fondo (oscurecido + `blur`) **funde a la vez que el panel desliza**: nunca aparece o desaparece de golpe.
  **Asimetría deliberada**: entra en `--dur-sheet-in` (el usuario mira llegar la hoja) y sale en
  `--dur-sheet-out` (ya decidió; que se quite de en medio). *Sustituye al "leve overshoot" anterior: en una
  hoja que puede ocupar la pantalla entera el rebote descubre una franja de fondo bajo el panel y lee como
  gomoso; la frenada larga de la curva de drawer da el peso sin el efecto barato.*
- **Cambio de mes** (cabecera): el nombre entra desplazado 6px **en el sentido del gesto** (› → entra desde
  la derecha) + fundido, `--dur-2`. Es continuidad espacial, no adorno: dice hacia dónde te has movido.
- **Barra de progreso**: anima el relleno al registrar un gasto (`width` con transición), no salta.
- **Press**: escala `0.98` + oscurecido; el botón de acento puede intensificar el glow al pulsar.
- **Solo `transform` y `opacity`** en lo que se mueve (van por GPU). `width`/`top`/`height` solo donde ya
  están justificados (barra de progreso, anclaje al viewport visible de la hoja).
- **Nada de fundidos al cambiar de vista** (barra inferior): navegar es una acción de decenas de veces al
  día; cualquier animación ahí se percibe como latencia.
- **Respeta `prefers-reduced-motion: reduce`**: sin desplazamientos ni escalados; cambios instantáneos.
- Usa la skill `review-animations` (`.claude/skills/`) como rúbrica antes de dar una animación por buena.

## 14. Accesibilidad y semántica (obligatorio)

- HTML **semántico** (`header`, `nav`, `main`, `section`, `button`, `dialog` para hojas).
- **Todo interactivo** accesible por teclado y con `:focus-visible` claro (anillo con `--accent`).
- **Contraste** suficiente en ambos temas (texto principal ≥ 4.5:1). Comprueba el bermellón sobre papel/tinta.
- Objetivos táctiles **≥ 44px**. Labels/`aria-*` en iconos sin texto. `aria-live` para el saldo al cambiar.

## 15. PWA / Añadir a pantalla de inicio

- Instalable, **standalone**, orientación vertical. `manifest.webmanifest` con iconos (squircle + maskable)
  y `theme-color` por tema (ver *Chrome del sistema*). Service worker para *app shell* offline.
- Iconos y sello del manual de marca (`KOBO Logo (offline).html`) → **§18**. Fuentes **autoalojadas**
  (sin llamada a Google Fonts).
- **Cómo se le ofrece al usuario** (tarjeta de Ajustes, hoja de instrucciones y aviso del login) →
  **§17.8**. Instalable no sirve de nada si nadie encuentra cómo instalarla.

**Comportamiento táctil (regla dura).** Dentro de la ventana standalone Kobo es una **app, no una página**:
el zoom accidental descoloca la cabecera *sticky* y la nav fija, y no hay barra de URL para deshacerlo.

- **Viewport**: `width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1,`
  `user-scalable=no, interactive-widget=resizes-content`. Lo último hace que el **teclado virtual encoja el
  layout viewport** (Chrome/Android): la nav y la hoja inferior quedan **encima** del teclado, no debajo.
- **Sin zoom por doble toque**: `touch-action: manipulation` en `html` (mata también el retardo de ~300 ms).
- **Suelo de 16 px** en `input`/`select`/`textarea`: por debajo, iOS **hace zoom al enfocar y no lo deshace**.
  Regla base en `global.css`; quien necesite más (el importe a 44px) lo pisa con su clase. **Nunca menos de 16.**
- **Sin `text-size-adjust`** automático (`100%`): iOS reescala el texto al rotar y parece un zoom.
- **Sin rubber-band, y el "tirar para recargar" lo ponemos nosotros**: `overscroll-behavior: none` en
  `html`/`body` apaga el rebote **y** el gesto nativo del navegador; el nuestro va aparte (bloque siguiente).
  `contain` en cualquier panel con scroll propio (hojas inferiores) para que no propague al fondo.
- **Sin flash de toque ni lupa**: `-webkit-tap-highlight-color: transparent` (cada control ya tiene su `:active`)
  y `user-select: none` + `-webkit-touch-callout: none` en controles y en el *chrome* (cabecera, nav).
  El **contenido** (importes, notas) **sigue seleccionable**: se puede copiar.
- Al tocar el shell (`index.html`, `manifest`, iconos), **sube `CACHE_VERSION` en `public/sw.js`** o el
  dispositivo seguirá sirviendo el `index.html` viejo como fallback offline.

**Tirar para recargar (2026-08-06).** En la PWA instalada no hay barra de URL, ni botón de recarga, ni el
gesto nativo (lo apaga `overscroll-behavior: none`). Si la app se queda atrás —datos viejos, versión vieja—
el usuario no tiene salida salvo cerrarla y reabrirla. Se le devuelve el gesto que ya usan los proyectos
hermanos, con los **mismos umbrales**, para que la mano no tenga que
reaprender nada entre apps:

- **Solo en standalone** (`display-mode: standalone` o `navigator.standalone`). En pestaña el navegador ya
  trae lo suyo y duplicarlo sería pelearse con él.
- **Umbrales**: holgura inicial **10 px** (ignora microtoques) · resistencia **0.4** (el indicador recorre
  menos que el dedo: se siente elástico) · tope **60 px** · dispara al soltar a partir de **50 px**.
- **Solo si estás arriba del todo** (`scrollTop` del contenedor bajo el dedo, o `window.scrollY` si el
  scroll es del documento, que es el caso del shell) y **solo en vertical**: si el gesto es más horizontal
  que vertical se cancela, para no competir con ningún paneo lateral.
- **Indicador**: píldora de **34 px** centrada bajo el safe-area, superficie `--surface` + borde 1 px +
  `--shadow-raised` (cruza la cabecera *glass* y tiene que leerse sobre ella), con el **anillo de `Spinner`**
  dentro: quieto y rotando con el dedo mientras arrastras, girando cuando la recarga ya está en marcha.
  Opacidad proporcional al tirón. Va en `z-index: 40` (sobre cabecera y FAB, bajo las hojas).
- **`prefers-reduced-motion`**: la píldora **no viaja** con el dedo, solo aparece por opacidad.
- **Zonas exentas** con `data-ptr="off"`: lo lleva la primitiva `BottomSheet`. Con una hoja abierta,
  arrastrar hacia abajo es "cerrar la hoja" o mover su contenido, nunca "reiniciar la app" — reiniciarla
  tiraría el movimiento a medio escribir.
- **La recarga es dura**: antes de `location.reload()` se le pide al service worker que compruebe versión
  (`registration.update()`, con tope de tiempo). El SW sirve los assets con hash en *cache-first*, así que
  un reload a secas puede devolver exactamente lo mismo que ya tenías — que es justo el problema que el
  usuario intenta resolver con el gesto. Implicación: **cada despliegue que quiera ser alcanzable por este
  gesto debe cambiar `public/sw.js`** (subir `CACHE_VERSION`).

**Chrome del sistema (regla dura).** Las franjas que pinta el SO —barra de estado / notch e indicador de
inicio— **siguen al tema de Kobo, nunca al del móvil**. Un iPhone en oscuro con Kobo en Washi no puede
tener una franja negra sobre papel.

- **Dos metas `theme-color`**, una por `media` (`prefers-color-scheme: light` y `dark`), y **las dos con el
  MISMO color**: el `--bg` del tema resuelto. iOS elige entre ellas por la apariencia del *sistema*; con una
  sola meta la descarta y pinta su negro por defecto. Igualándolas no le dejamos elegir.
- **Barra de estado de iOS**: `apple-mobile-web-app-status-bar-style` = `default` en Washi (fondo claro,
  glifos oscuros) y `black` en Sumi. **Prohibido `black-translucent`**: está deprecado y fuerza glifos
  **blancos**, ilegibles sobre el papel de Washi.
- **`html` lleva `background: var(--bg)`**, no solo `body`: es el color con el que el webview rellena lo
  que el contenido no cubre (safe-areas, rebote del scroll). Sin él asoma su fondo, negro en modo oscuro.
- Fuente única: el color sale del token `--bg` (`applyTheme` lo lee), **nunca literal**. La única copia
  literal admitida es la semilla del script anti-FOUC de `index.html` y el `theme_color` del manifest
  (estático, lo usa la *splash*): ambos en el papel de Washi, el tema por defecto.
- Todo esto se aplica **antes del primer pintado** (script inline del `<head>`): iOS lee estos metas al
  **lanzar** la app desde la pantalla de inicio, no después.

## 16. Checklist final de UI (repásalo antes de cerrar un PR de UI)

- [ ] **Cero colores literales**: todo vía tokens `--*`. Se ve bien en **Washi** y en **Sumi**.
- [ ] **Cifras/titulares en Shippori Mincho**; UI en system sans. "Cifras en Mincho" respetado.
- [ ] Radios del sistema (tarjetas `22px`, píldoras `99px`), bordes 1px, sombras/glass del §4.
- [ ] Acento usado con mesura (barras, botón principal, sello); nada de neón.
- [ ] Motion del §13 y `prefers-reduced-motion` respetado.
- [ ] Accesibilidad §14: teclado, foco visible, contraste, targets ≥44px, `aria` en iconos.
- [ ] Táctil §15: ningún control de texto por debajo de **16px**; nada que provoque zoom o lupa en móvil.
- [ ] **Escritorio §19**: repasado el checklist §19.7 (1024/1440, nada estirado, hover con guard, móvil intacto).
- [ ] Coincide con el mockup `KOBO App (offline).html`. Si introduje algo nuevo, **lo añadí a este DESIGN.md**.

## 17. Adiciones v2 (build de la app — 2026-08-06)

> Decidido e implementado al construir la app; registrado aquí por la regla "si introduzco algo nuevo, lo añado a DESIGN.md".

- **Navegación: 5 destinos.** La barra inferior es **Taller · Gastos · Cuentas · Meses · Yo**, con un **FAB de acento `+`** centrado que abre la hoja "Nuevo movimiento" (gasto **o** ingreso vía *segmented*). "Cuentas" es el plano de **patrimonio** (§17.1).
- **Kanji en la barra inferior (por defecto).** Cada destino se rotula con su **kanji en Mincho** sobre la etiqueta en español, como en el mockup canónico: **房** Taller · **記** Gastos · **財** Cuentas · **月** Meses · **我** Yo. `財` es adición nuestra (el mockup no tiene Cuentas): se elige por **財産** *patrimonio*, §17.1. Reglas: el glifo vive en una caja de **24×24 px** — la misma que ocupa el icono SVG — para que conmutar no mueva la barra; es **`aria-hidden`** (la etiqueta en español ya nombra el destino, §14); **no** depende de "Cifras en Mincho" (es decoración, no una cifra); el estado activo sigue siendo **color `--accent`**, sin cambio de peso. Ajustes → Apariencia → **"Kanji en la navegación"** lo apaga y devuelve los iconos SVG (`useTheme().navKanji`, clave `kobo.navKanji`, **ON** por defecto).
- **Selector de mes (v1): stepper `‹ Agosto ›`** en la cabecera, en vez del `Agosto ▾` con desplegable del mockup (la hoja de meses queda como follow-up). Navega mes±1.
- **"Cifras en Mincho" — mecanismo.** Token `--font-numbers` + clase `numbers-sans` en `<html>` (`styles/global.css`): con el ajuste ON (por defecto) las cifras van en Mincho; OFF conmuta a system sans. Lo controla `useTheme().mincho`.
- **Ingreso vs gasto sin color nuevo.** No se introduce token verde (no existe en el sistema): se distingue por **signo** (− gasto / + ingreso) y matiz con tokens existentes (`--accent` / `--ink`). Si algún día se quiere un verde "positivo/ahorro", **definirlo aquí primero** (§3 lo deja pendiente).

### 17.1 Vista Cuentas (Patrimonio 資産)
Plano de dinero **total**, separado del mes a mes. `total = Σ cuentas Σ buckets.balanceCents`.
- **Hero "Patrimonio total"** (mismo patrón que el hero del Taller): cifra enorme Mincho + kanji `資産` + `{n} cuentas`.
- **Tarjetas de cuenta** (§7): punto de color + nombre + total; **expandible** a sus **sub-saldos (buckets)** editables (p. ej. "Sueldo base" + "Inversión"). Acciones: añadir/renombrar/borrar cuenta y bucket, y editar el balance a mano (reconciliación) vía hoja inferior.
- **Enlace con el mes a mes:** un gasto/ingreso puede apuntar a cuenta+bucket; al registrarlo ajusta ese balance (gasto resta, ingreso suma), de modo que cada movimiento afecta al mes **y** al patrimonio.

### 17.2 Desglose de categoría (Taller, 2026-08-06)

Cada fila de categoría del Taller es un **acordeón**: al pulsarla se despliega su desglose del mes.
Es la materialización de la "expansión" que §7 dejaba enunciada.

- **Toda la fila ES el `<button>`** (punto, nombre, importes, barra y chevrón dentro). Nada de un botón
  pequeño con un `::after` estirado: un pseudoelemento que se sale de su botón **no es un objetivo táctil
  fiable** (WebKit no lo acierta) y deja media fila muerta al tocar. Para que el HTML siga siendo válido,
  dentro del botón solo va *phrasing content*: por eso `ProgressBar` y `Money` renderizan `<span>`.
  Estado por `aria-expanded` + `aria-controls`; **chevrón** a la derecha que rota 180° (200 ms, easing §13).
- **Acuse del toque**: `:active` sobre `--surface-2` (el tap-highlight del sistema está desactivado en
  `global.css`, así que cada control se lo pone él) y foco de teclado con anillo de acento en toda la fila.
- **Al abrir, la fila sube a la vista** si su desglose se sale de la pantalla (`scroll-margin-top` = alto
  de la cabecera sticky): abrir la última categoría y no ver nada se lee como "no ha pasado nada".
- **Uno abierto a la vez** (acordeón exclusivo): en móvil, dos paneles abiertos obligan a hacer scroll a ciegas.
- **Región desplegada** sobre `--surface-2` (igual que la fila abierta, para que se lean como un bloque),
  separada por borde de 1 px y con la animación `reveal` (opacidad + 4 px, 200 ms) ya usada en Cuentas.
- **Contenido**, en este orden:
  1. **El sobre**: `Asignado · Gastado · Queda` en tres columnas sobre `--surface`. Si se pasó,
     la tercera columna es **"Excedido"** en `--accent-strong` (nunca un rojo nuevo).
  2. **Por subcategoría** (solo si hay): total por subcategoría ordenado de mayor a menor, con
     **mini-progreso de 5 px** y su `limit?` cuando existe. Bajo la barra, **alineada a la derecha**
     (bajo las cifras), una línea tenue con **lo que queda de ese límite**: `Queda X` en `--ink-4`
     o, si se pasó, `Excedido X` en `--accent-strong` — mismo vocabulario que el sobre, y en ese
     caso el `gastado` de la fila ya va en acento. Sin límite (`0` o ausente) **no hay barra ni
     línea**: un tope de 0 € no es un tope, y "queda" no significa nada sin techo contra el que
     medir. Los gastos sin subcategoría (o con una ya borrada) se agrupan al final como
     **"Sin subcategoría"**.
  3. **Movimientos**: hasta **6** filas `día corto · nota/subcategoría · importe en negativo`. El
     encabezado lleva el **total** en una píldora. Vacío: "Sin gastos en esta categoría este mes."
  4. **Salida a Gastos**: botón *ghost* a ancho completo que navega a la vista Gastos con **el filtro de
     esa categoría ya aplicado** (el desglose informa; editar y borrar sigue viviendo en Gastos, un solo sitio).
- **Datos**: los gastos del mes se piden **una vez** al abrir la primera categoría y se reparten en
  cliente (no una petición por categoría); se recargan solos al cambiar de mes o al registrar un movimiento.

### 17.3 Fondos de previsión — 積立 (Taller + Ajustes, 2026-08-06)

Un **fondo** es un gasto **NO mensual** que se suaviza (p. ej. un pase de 150 € que se paga cada ~4 meses):
reserva su equivalente mensual del presupuesto de la categoría y **acumula** hasta el pago real (una
**hucha**, que rima con la marca daruma §18). Regla de dominio: **reserva ≠ gasto**.

- **Dónde vive**: dentro del desglose de la categoría (§17.2), como un bloque **"Fondos 積立"** entre el
  sobre y las subcategorías. El kanji **積立** (*tsumitate*, "ahorro por acumulación") va en `--font-display`,
  `aria-hidden`, como apoyo del rótulo en español.
- **Cada fondo = una hucha**: fila `nombre · saldo / objetivo` + **mini-progreso** (barra de 6 px, saldo
  sobre objetivo; el saldo negativo por pago anticipado se **clampa a 0** en la barra pero se muestra el
  número real). Debajo, meta tenue (`--ink-4`, tabular): **`≈ X €/mes`** · estado (**"Listo para pagar"** en
  `--accent-strong` cuando saldo ≥ objetivo, o **"≈ N meses para el objetivo"**) · **"pagado Y"** si hubo
  pago este mes. Nunca un color nuevo: solo tokens.
- **El sobre resta lo reservado**: "Queda" = `asignado − reservado − gastado`. Si hay fondos, bajo el sobre
  una línea tenue **"X reservado a fondos este mes"** para que la cuenta sea transparente.
- **El pago real** (el 150 € de golpe) **no** aparece en la lista de movimientos ni en el reparto por
  subcategoría de la categoría: se refleja en la hucha (baja el saldo) y en la vista Gastos. Así "Gastado"
  cuadra con la lista.
- **Ritmo del mes** (§6) se mide contra el **presupuesto libre** (`asignado − reservado`): apartar a un
  fondo no debe disparar el "vas rápido".
- **Añadir gasto** (§8): elegida una categoría con fondos, aparece un chip **"Pago de fondo 積立 (opcional)"**;
  al elegirlo se propone el importe objetivo y, si el fondo está anclado, **se selecciona su subcategoría**
  (ver abajo). Un fondo sin ancla respeta la subcategoría que el usuario hubiera elegido a mano.
- **Gestión** (Ajustes → Categorías): botón **"Fondos 積立"** por categoría abre una hoja inferior
  (`FondosSheet`) con crear/editar/borrar (nombre · objetivo € · cada N meses · subcategoría) y un hint del
  reservado/mes. Mismo patrón de fila editable que Subcategorías (§17.2 no, §11). No se borra un fondo con pagos.

**Ancla a una subcategoría (2026-08-11).** Un fondo puede apuntar a una **subcategoría** de su categoría
(`subcategoryId`, opcional). Es **etiqueta, no presupuesto**: el dinero se reserva y se gasta siempre del
sobre de la **categoría** — una subcategoría no tiene sobre propio, solo un límite de gasto.

- **Selector**: chips de subcategoría en `FondosSheet` (crear y editar). Tocar el chip ya elegido lo
  **desancla**. Si la categoría no tiene subcategorías, el selector no se pinta.
- **Dónde se ve la hucha**: un fondo anclado se pinta **dentro de su subcategoría**, en el bloque "Por
  subcategoría", como lista sangrada con **filete izquierdo de 1 px** (`--border`); los fondos sin ancla
  siguen en el bloque **"Fondos 積立"**. Una subcategoría con fondo **aparece aunque no tenga gasto ese mes**
  (si no, la hucha desaparecería justo los meses en que no se paga).
- **El pago no consume el límite de la subcategoría** ni el "Gastado" del mes: ese dinero llevaba meses
  apartado. Sí aparece **etiquetado** en Gastos, que es donde vive el historial.
- **Descubribilidad**: el bloque "Fondos 積立" se pinta **siempre** en categorías no-ahorro, aunque esté
  vacío, con una línea de explicación y un botón **ghost** de ancho completo ("Crear un fondo" / "Gestionar
  fondos") que abre la misma `FondosSheet` desde el Taller. En un **sobre de ahorro** el bloque solo sale si
  ya hay fondos: ahí el dinero se traspasa, no se gasta.
- **Borrar la subcategoría desancla sus fondos** (siguen vivos en la categoría). Los gastos ya registrados
  conservan su etiqueta: son historia, no configuración.

### 17.4 Categoría comodín y su reparto mensual — 割 (Taller + Ajustes, 2026-08-06)

Una categoría puede marcarse como **comodín** (`flexible`): su dinero **no se gasta en ella**, sino que
cada mes se **reparte** entre otras categorías. Es el patrón para una partida "sin destino fijo" (p. ej.
*Aleatorio*: un mes va a Ahorro, otro a Ocio). Kanji de apoyo: **割** (reparto).

- **Marcar el comodín** (Ajustes → Categorías → editor): un `Switch` **"Comodín 割"** con una línea de
  ayuda ("Su dinero no se gasta aquí: cada mes lo repartes entre otras categorías desde el Taller").
  Separado del resto por un *hairline*. El `Switch` lleva `aria-label`; el texto no es su `<label>`
  (un `role="switch"` es un `<button>`, no un control de formulario asociable por `htmlFor`).
- **Repartir** vive en el **Taller** (donde hay mes en contexto), dentro del **desglose** del comodín:
  un módulo sobre `--accent-tint` con el eyebrow **"Comodín 割"**, el resumen `repartido X de Y` y un
  botón *accent* **"Repartir este mes"**. No se reparte desde Ajustes (allí no hay mes en contexto).
- **Hoja "Repartir · <comodín>"** (`BottomSheet`, solo tokens): intro; **resumen** de dos columnas
  (`Repartible` · `Queda`/`Te has pasado` en `--accent-strong`); **una fila por categoría destino**
  (punto de color · nombre · importe en **€**) y, cuando el destino tiene subcategorías y hay importe,
  un `ChipGroup` opcional **"Subcategoría (opcional)"** (empieza en *Sin subcategoría*). La subcategoría
  es solo una **pista**: el presupuesto aterriza en la categoría padre (las subcategorías no tienen
  presupuesto propio, solo `limit?`). Guardar bloqueado si el reparto supera lo repartible.
- **Neutralidad (regla de dominio):** el reparto es una **reasignación**, no crea ni destruye dinero.
  En el panel, el destino **suma** lo recibido a su "asignado" y el comodín lo **resta** (aparece como
  *repartido*), pero el **total del mes y "queda por gastar" no cambian**. Vive por **(comodín, mes)**:
  cambiar agosto no toca julio. El dinero es sagrado: importes en **céntimos**, suma acotada a lo asignado.

#### 17.4.1 Hacer visible el comodín — aviso, marca y trazabilidad (2026-08-06)

El mecanismo del comodín es invisible si su única puerta es un botón **dentro** del acordeón: nada en la
lista dice que una categoría es comodín, un comodín sin repartir no reclama nada, y el destino no cuenta
de dónde le vino el dinero. Tres señales lo arreglan, todas dentro de la sección **Categorías** del Taller:

- **Aviso accionable (`.aviso`)** — sobre la tarjeta de la lista, **una tarjeta por comodín con dinero sin
  repartir**: `--accent-tint` + borde `--accent`, eyebrow **"Comodín 割"**, texto `<nombre> · X sin
  repartir este mes` y botón *accent* **"Repartir"** que abre la hoja **directamente**, sin desplegar
  nada. Es la puerta principal. **Se autodestruye**: cuando el mes está repartido del todo desaparece —
  un aviso permanente es ruido, no información. Con reparto parcial sigue visible con el resto.
- **Marca en la fila** — chip **`割`** (`.tagComodin`, `--accent` sobre `--accent-tint`) junto al nombre,
  siempre: identifica la categoría como comodín en la lista. Bajo la barra, una línea de apoyo
  (`.repartoNote`): **`X sin repartir`** en `--accent` si queda pendiente, o **`Repartido X`** en
  `--ink-4` cuando ya está todo. El `aria-label` de la fila lo dice también (no solo por color).
- **Trazabilidad en los dos extremos** (desglose):
  - En el **comodín**, bajo el módulo de reparto, **a dónde va** (`.destinos`): una fila por destino
    (nombre · importe). Sin reparto aún, una línea de ayuda en su lugar.
  - En el **destino**, junto a la nota de fondos: **`+X de <comodín>`** (`.receivedNote`, en `--accent`),
    para que el asignado que subió tenga origen visible. Varios comodines → varias líneas.
  - Los tramos se leen de `GET /distributions?month=` (una petición más en el detalle del mes, junto a
    gastos y subcategorías). Se **descartan** los tramos cuyo destino ya no existe o apuntan al propio
    comodín — la misma regla que `services/reparto.ts`, para que la UI no muestre dinero que no cuenta.

### 17.5 La nómina en el historial — 給料 previsto vs. cobrado (Gastos, 2026-08-06)

La nómina del mes **siempre aparece en la lista de ingresos** de la vista Gastos, pero con dos estados
visualmente distintos, porque son dos cosas distintas: dinero **previsto** y dinero **cobrado**.

- **Cobrada** (existe un `Income` con `isNomina`): fila de ingreso normal — punto de acento relleno
  (`.dotIn`), importe en `--ink` con signo `+`, y nombre **"Nómina"** cuando no se escribió otro origen
  (nunca la etiqueta genérica "Ingreso"). Cuenta en el total **Ingresos** de la cabecera.
- **Prevista** (aún no se ha registrado el cobro): fila **virtual** derivada de la config de nómina, en
  la fecha del día de ingreso del mes. Se distingue por tres señales, todas de apoyo y ninguna de alarma:
  punto **hueco de trazo discontinuo** (`.dotPrev`, `1.5px dashed var(--accent)`), píldora
  **"Prevista · sin cobrar"** (`.prevTag`: mismo molde que `.histTag` pero en `--accent` sobre
  `--accent-tint`) e importe en `--ink-3` (`.amountPrev`). Al desplegarla, el mismo editor inline que el
  resto de filas, con **importe editable** (imprescindible con nómina variable) y un único botón
  *accent* **"Registrar ingreso"** — sin "Eliminar": no hay nada que borrar.
- **Regla dura de dominio — previsto ≠ cobrado.** La fila prevista **no suma** al total "Ingresos" ni al
  patrimonio: nadie ha cobrado todavía. Se muestra aparte en la cabecera ("Nómina prevista +X", en
  `--ink-3`) y solo se convierte en dinero real al confirmarla, que es cuando se crea el `Income` y se
  suma a la cuenta vinculada. Tampoco se proyecta a **meses futuros**, y en el mes en curso su fecha
  nunca es futura (si el día de cobro no ha llegado, se propone hoy).
- **Filtros:** a efectos del `Segmented` de tipo, la prevista **es un ingreso** (sale en *Todos* y en
  *Ingresos*, no en *Gastos*); el filtro por categoría la excluye, como a cualquier ingreso.

### 17.6 Rendimiento del patrimonio — 評価 (Cuentas + Meses, 2026-08-06)

El dinero también se mueve **sin que tú lo muevas**: intereses de una cuenta remunerada y subidas o
bajadas de una inversión. Es un plano distinto del gasto, y se pinta como tal — **nunca** con el
lenguaje visual de un ingreso.

- **Naturaleza del sub-saldo, en kanji.** En la tarjeta de cuenta, un sub-saldo que no es efectivo lleva
  su glifo detrás del nombre, en Mincho y `--ink-3`: **貯蓄** remunerado · **投資** inversión (el
  efectivo, **現金**, no lleva marca: es el caso normal y no debe generar ruido). `aria-hidden`: el
  nombre ya identifica la fila.
- **Acción por sub-saldo.** El que rinde muestra a su derecha una **píldora de acento en trazo**
  (borde `--border`, texto `--accent`, radio `--r-pill`, alto ≥44px): **"Valor"** en inversión,
  **"Intereses"** en remunerado. Si hay una liquidación estimada sin registrar, la píldora se **rellena
  con `--accent-tint` + borde `--accent`** y muestra el importe estimado con **tilde de aproximación**
  (`~10,32 €`). La tilde es obligatoria: es una estimación, no dinero.
- **Hoja de valoración.** Dos caras del mismo evento, elegidas por el tipo de sub-saldo. Inversión:
  *"¿Cuánto vale ahora?"* con el valor registrado y lo aportado arriba, y el **rendimiento en vivo**
  bajo el campo (`.factStrong`, 18px, `--ink`). Remunerado: *"¿Cuánto te han abonado?"* con el desglose
  de la estimación (días · bruto · retención · neto) en filas `.factRow` (etiqueta `--ink-3` a la
  izquierda, cifra `--ink-2` a la derecha). Cierra siempre con la misma nota: *"mueve tu patrimonio,
  pero no es un ingreso"*.
- **Tarjeta Rendimiento (評価)** en Cuentas, hermana de Movimientos (振替): total arriba a la derecha,
  filas `sitio · tipo · fecha` con importe **firmado** y "Deshacer" (`IconClose`, `IconButton quiet`).
  Sin tarjeta si no hay nada registrado.
- **Sin verde, otra vez (§17).** Un rendimiento negativo **no** se pinta de rojo ni el positivo de
  verde: se distingue por el **signo** y el peso, con los tokens de siempre.
- **Meses: la variación del patrimonio, descompuesta.** Bajo la comparativa, un bloque separado por
  `1px solid var(--line)`: **"Patrimonio +X"** (14,5px, `--ink`) y debajo, en 12,5px `--ink-3`, las dos
  patas — *aportado* y *rendimiento*. Es la lectura que justifica todo lo anterior: cuánto subió porque
  ahorraste y cuánto porque el dinero trabajó. Si el mes no movió patrimonio, el bloque no aparece.

### 17.7 Sobre de ahorro — 貯 (Taller + Ajustes, 2026-08-06)

Una categoría puede ser un **sobre de ahorro**: su dinero no se gasta, se mueve a tus cuentas. Se lee
como una categoría normal, pero con el vocabulario cambiado — nunca "gastado".

- **Marca:** glifo **貯** detrás del nombre, mismo molde que el **割** del comodín (`.tagComodin`).
  Los dos son excluyentes: el Switch de uno apaga el del otro en el editor de categoría.
- **Vocabulario:** la fila y el desglose dicen **"Ahorrado"** en vez de "Gastado" y **"Por ahorrar"**
  en vez de "Queda"; la leyenda de la cabecera pasa a *"gastado o ahorrado / asignado"* en cuanto
  existe un sobre de ahorro. La barra de progreso mide lo **movido** contra lo asignado.
- **Movimientos del desglose:** en un sobre de ahorro no se listan gastos (no los hay), sino los
  **traspasos** que lo consumieron, con importe en **positivo** (entra en tu ahorro). Sin salida a
  Gastos: esos movimientos viven en Cuentas.
- **Al mover dinero** (hoja "Nuevo movimiento" → Mover), si existe algún sobre de ahorro aparece
  **"Consume sobre (opcional)"**: chips con "Ninguno" + un chip por sobre. Es opcional a propósito —
  no todo traspaso es ahorro.
- **Regla de dominio que se ve en pantalla (revisada 2026-08-27):** ahorrar **no** es gastar y **no**
  toca el patrimonio (mueve dinero de un bucket tuyo a otro). Su **% ya no se pre-resta** del "Queda por
  gastar": el asignado del sobre es solo una **meta**. El presupuesto baja **cuando haces el traspaso**
  (movimiento a mano etiquetado con el sobre → `ahorradoTotalCents`), no antes. Motivo: el ahorro real es
  variable (unos meses 0, otros más), así que descontar un % fijo cada mes mentía. Ver §6 (hero) y
  `decisiones.md`.

### 17.8 Instalación guiada — アプリ (Yo + Login, 2026-08-06)

Kobo es instalable (§15) pero **nadie lo sabe si no se le dice**: en Chromium el navegador esconde la
oferta en un menú, y **en iPhone no existe la instalación de un toque** — es Compartir → "Añadir a
pantalla de inicio", a mano. Se cubren los dos mundos con **una sola guía** y dos entradas.

- **Una fuente de instrucciones.** Todo apunta a la misma hoja `InstallSheet` ("Instalar Kobo").
  Prohibido repetir los pasos en prosa en otro sitio: la tarjeta de **通知 Notificaciones**, que en
  iPhone es un callejón sin salida sin la app instalada, ya no explica nada — ofrece **"Cómo"** y abre
  esta hoja.
- **La hoja**: intro + (si hay prompt nativo) bloque de atajo con **"Instalar ahora"** + **segmentado
  de tres pestañas** — `iPhone · Android · Ordenador` — y **pasos numerados**. Arranca en la
  plataforma detectada, pero **siempre trae las tres**: mirar la guía del iPhone desde el ordenador es
  el caso real más común, y entonces se añade *"abre `host` en ese dispositivo"*. El número del paso
  va en **círculo `--accent-tint` con la cifra en Mincho**; los glifos del sistema que se nombran
  (**Compartir**, **⋮**, **instalar**) se dibujan detrás del texto (`IconShare`, `IconDots`,
  `IconInstall`, `IconAddToHome`) porque reconocer el icono es media instrucción.
- **Ajustes → アプリ · La app**: fila de acción (**"Instalar"** en acento si hay prompt nativo,
  **"Cómo"** en fantasma si no) que al instalarse se convierte en un **sello "Lista ✓"** del alto del
  botón (la tarjeta no cambia de altura), más una fila **"Instrucciones"** que está **siempre**,
  también con la app ya instalada: sirve para ponerla en el *otro* dispositivo.
- **Aviso del login** (`InstallBanner`): recuadro pequeño apoyado en el borde inferior, dentro de la
  columna del formulario, `--surface` + `--shadow-raised` + radio `--r-lg`, `z-index: 30`. Entra
  **subiendo 16 px** con `--dur-sheet-in` / `--ease-out` tras **900 ms** (la pantalla se asienta
  primero) y sale bajando 12 px con `--dur-sheet-out`.
  - **Cuándo sale**: móvil (iOS/Android) · en el navegador (no standalone) · sin instalar · sin un
    "ahora no" en los **últimos 14 días**. En escritorio **no sale nunca**: allí la entrada es Ajustes.
  - **No es un modal**: no roba el foco, no tapa los campos y no bloquea nada. Quien viene a entrar,
    entra. Botón único —**"Instalar"** si hay prompt, **"Ver cómo se hace"** si no— y **✕ "Ahora no"**.
  - **Un "no" es un no**: si el usuario descarta el diálogo nativo del sistema, el aviso se retira y
    se silencia igual que con el ✕. Insistir justo después de un rechazo es lo que hace odiosos estos
    banners.
- **Callejón del navegador embebido** (Instagram, Facebook…): desde ahí no se puede instalar. Si se
  detecta, la hoja lo dice con la caja de acento y manda abrir la dirección en el navegador de verdad.

### 17.9 Fila-bloque y tarjeta 通知 · Notificaciones (Yo, 2026-08-11)

**Fila-bloque (`BlockRow`) — patrón de Ajustes, no solo de esta tarjeta.** La fila normal (`Row`) pone
el control **a la derecha con `flex: none`**: encaja con un interruptor, un botón o un input corto, y
**se rompe con cualquier control ancho**. La cuenta en móvil no deja lugar a interpretación: a 390 px
la tarjeta deja **326 px útiles** dentro de la fila, y un segmentado de tres etiquetas desiguales
("Nunca · Sin clasificar · Todos") pide ~280 px, así que el que encoge es el **título**. A 320 px el
control se sale y la tarjeta lo recorta (`overflow: hidden`).

- **Regla**: si el control no cabe **cómodo** a la derecha en móvil (segmentados de 3+ opciones, tiras
  de chips), la fila se parte en dos alturas — **título + subtítulo arriba, control a lo ancho debajo**
  (`--space-2` de separación). Mismo padding que `Row`, para que la columna de texto quede a plomo.
- **Bloque hijo** (`child`): cuando el control **depende del ajuste de la fila anterior** (la hora bajo
  su recordatorio), va **sin `Hairline` y sin aire arriba**. La hairline separaría dos ajustes hermanos,
  y estos no lo son: pegarlo es lo que dice "esto es de ahí arriba".
- **Selección a lo ancho = chips, no segmentado.** Un segmentado reparte `1fr` entre opciones y con
  etiquetas de anchos muy distintos queda descompensado; además no envuelve, así que en la pantalla
  estrecha o parte el texto o desborda. Los chips (`ChipGroup`) **envuelven solos** y ya son el patrón
  de selección a lo ancho de Ajustes (cuenta de ingreso de la nómina). El segmentado se queda para
  pares o ternas cortas y de ancho parejo (`Fija/Variable`, `%/€`).

**La tarjeta 通知.** Mantiene separadas dos cosas que se confunden solas: el **permiso de este
dispositivo** (interruptor; vale solo para este navegador) y **qué avisos quieres** (preferencias de la
cuenta, para todos los dispositivos). Lo segundo **solo existe si lo primero está activo**.

- **Fila 1 — "En este dispositivo"**: interruptor; el subtítulo lleva la cuenta (`Activado · 3
  dispositivos en total`). Callejones sin salida antes que un interruptor que no hará nada: en iPhone
  sin instalar, fila **"Instala Kobo primero" + "Cómo"** → hoja única de §17.8; sin soporte del
  navegador o sin claves VAPID en el servidor, **nota a fila completa** (`.noteRow`, con el padding de
  la tarjeta — una nota suelta en el `Group` se pegaría a los bordes).
- **Bloques 2 y 3 — avisos**: "Avisar de un gasto" (chips `Nunca · Sin clasificar · Todos`) y
  "Recordatorio de fin de día" (interruptor) con su **bloque hijo** de hora (chips `18:00…23:00`, dos
  filas en móvil). Se guardan **al tocar**, con optimismo revertido si el `PATCH` falla — sin botón de
  guardar: son preferencias sueltas, no un formulario.
- **Fila 4 — "Probar"**: envía un aviso al momento. **Su propio estado de carga**, no el del
  interruptor. Y la confirmación **se ve** (`.noteRow`) además de anunciarse: hasta que llega el aviso
  —si llega— no hay ninguna otra señal de que haya pasado algo.
- **Sin animación de entrada** en el bloque de preferencias: aparece cuando responden la suscripción y
  la API, no por un gesto del usuario (§13 / `ui/motion.module.css`); animarlo haría parpadear la
  pantalla sola al cargar.

### 17.10 Mes de nómina — el mes empieza el día de cobro (Shell + Taller + Meses + Yo, 2026-10-29)

El "mes" de Kobo puede ser un **ciclo de nómina**: si cobras el 25, tu mes de verdad va del 25 al 24, y
así lo mide todo (presupuesto, ritmo, Gastos, Meses, la guardia de una nómina por mes, los fondos).

- **Nombre = mes en que empieza el ciclo:** "Octubre" = 25 oct → 24 nov. La nómina cae el **día 1** del
  ciclo que financia.
- **Cabecera:** bajo el nombre del mes, el **tramo** en sans 10px `--ink-3` (`.monthRange`,
  "25 oct – 24 nov"). Solo si el ciclo no es el mes natural: decir "1 – 31" sería ruido.
- **Ritmo del mes:** los extremos de la línea de tiempo son los días reales del ciclo ("25 oct · día
  5/31 · 24 nov"), no "1 → 31".
- **Meses:** cada tarjeta lleva el tramo bajo el título (12px `--ink-3`) cuando no es mes natural. El mes
  de transición se ve tal cual es (p. ej. "1 sept – 24 oct").
- **Yo → Nómina → "Inicio del mes"** (`BlockRow`): segmentado `Día 1 · Día N · cobro` (N = día de cobro,
  como mucho 28). Si el valor cambia, aparece un **bloque hijo** "Aplicar desde" (`Este mes · El mes que
  viene`) con la consecuencia escrita: el mes anterior se alarga o acorta para no dejar días sueltos.
- **Regla de dominio:** los cambios se guardan como **tramos** (`desde mes → día`); un cambio nuevo nunca
  reescribe los ciclos ya vividos. Ver `decisiones.md`.

### 17.11 Suscripciones — 定期 (Yo, 2026-10-29)

Pagos que se repiten y que Kobo **apunta solo**, como gasto real, el día del cargo.

- **Tarjeta en Yo** (tras Categorías): fila de resumen **"Comprometido al mes"** (Mincho 17px; las
  anuales suman su doceava parte), una fila por suscripción (punto del color de su categoría + nombre;
  sub "importe · cada mes, el 15 · próximo 15 nov" o "en pausa") con **Editar**, y pie con nota +
  **Añadir** (`quiet`). Vacía: `.noteRow` explicando qué hace.
- **Hoja** (`SuscripcionSheet`): Nombre + Importe en una fila · `Cada mes · Cada año` · (anual) chips de
  mes `ene…dic` · Día de cobro + **Próximo cargo** (`date`, mínimo hoy; en el alta se propone solo hasta
  que lo tocas) · chips de categoría → subcategoría · chips de cuenta → sub-saldo · (edición) interruptor
  **Activa** + "Borrar suscripción" con confirmación ("los cargos ya apuntados se quedan").
- **Nada retroactivo:** el próximo cargo nunca es pasado (duplicaría lo apuntado a mano). Reprogramar o
  reanudar no cobra dos veces el mismo periodo.
- En Gastos el cargo se ve como un gasto más, con el nombre de la suscripción como nota.

### 17.12 Pulidos del 2026-10-29 (Gastos, Yo, Meses, Cuentas)

- **Gastos — filtro por cuenta:** tercera tira de chips (punto del color de la cuenta + "Sin cuenta" si
  hay movimientos que no tocan saldo); solo si hay ≥ 2 opciones. Aplica a gastos **e** ingresos. Con
  cualquier filtro activo, línea **"Filtrado: gastado X · ingresos Y"** (13px `--ink-2`) bajo los chips.
- **Subcategorías — presupuesto de la categoría:** caja `.subBudget` (fondo `--surface-2`, borde 1px,
  `--r-md`) arriba de la hoja: *Total de la categoría* · *Reservado a fondos* (si hay) · *Asignado a
  subcategorías* · **Queda por repartir** (Mincho 20px). Se recalcula **con cada tecla**, incluido el
  límite que estás escribiendo. Si los límites superan el total: "Te pasas en" + cifra en `--accent`
  y una línea de aviso (se puede guardar igual).
- **Meses — patrimonio:** bloque fijo con **"Patrimonio al cierre"** (hoy: "Patrimonio hoy") en Mincho
  18px a la derecha, y la variación "↑ +X € respecto al mes anterior" (acento si sube, `--ink-3` si
  baja) con su desglose aportado · rendimiento. La comparativa de **gasto** va junto al gasto y dice
  "Gastaste X € más/menos…", para no confundirse con la de patrimonio.
- **Automatización:** una fila por dispositivo activo ("Cuenta · por defecto Categoría" + **Editar** →
  hoja con nombre, cuenta/sub-saldo y categoría/subcategoría por defecto). La nota explicativa va en
  `.noteRow` (antes `.note` suelta: el texto se pegaba a los bordes).
- **Botones (reset global):** `button { border: 0; background: none }`. El navegador de escritorio
  pintaba su borde y su gris nativos en botones sin esos estilos (barras oscuras en las tarjetas de
  Cuentas, círculo gris en las flechas del mes). Quien quiera borde o fondo lo declara en su módulo.

## 18. Marca — 達磨 Daruma hucha (2026-08-06)

> Fuente de verdad: `KOBO Logo (offline).html` (manual de marca), que muestra los PNG de [brand/](brand/)
> por ruta relativa — ábrelo desde la raíz del repo.
> **Sustituye** al icono anterior (squircle bermellón con el glifo 工). Ese ya no se usa en ninguna parte.

### 18.1 El símbolo y su porqué

Un **daruma** (達磨) con **ranura de hucha** en la coronilla. El daruma se pinta **un ojo al fijarse una
meta** y **el otro al cumplirla**; la ranura lo convierte en hucha. Es exactamente el gesto de la app:
repartes la nómina (un ojo) y el mes cerrado dentro de presupuesto te devuelve el segundo.

- **Estado por defecto = un solo ojo pintado.** El izquierdo relleno, el derecho en contorno.
- **Estado logrado (dos ojos)**: reservado a **mes cerrado dentro de presupuesto**. Nunca como icono por
  defecto, nunca decorativo. Es un premio; si se usa siempre, deja de significar algo.

### 18.2 Geometría (viewBox `0 0 512 512`)

Trazada del original con un error máximo de **0,8 px** sobre 512. Vive en `client/src/ui/Daruma.tsx`
(in-app) y en `client/public/icon.svg` (asset de plataforma). **No la redibujes a ojo.**

| Elemento | Geometría |
| --- | --- |
| Cuerpo | path de 8 curvas, bbox `97,4–414,6` × `114,6–406,5` (62 % del lienzo) |
| Ranura | píldora `116 × 15`, `rx 7,5`, centrada en `(256, 144)` |
| Cara | elipse `cx 256 cy 237 rx 90 ry 62,5` |
| Ojo pintado | elipse `cx 216 cy 237 rx 16 ry 19`, relleno |
| Ojo sin pintar | misma elipse en `cx 296`, solo contorno de `6` |

**Zona segura maskable**: el punto más lejano del daruma queda a **172 px** del centro, dentro del radio
de 205 (80 %). Por eso el mismo archivo sirve para `any` y `maskable`, sin versión reducida aparte.

### 18.3 Uso y colores

- **In-app** → `<Daruma size logrado mono />`, **a color y sin nada detrás**: ni disco, ni squircle, ni
  borde. Usos actuales: cabecera `30` · Yo `44` · login `56`. `mono` da la silueta plana en
  `currentColor` (con ranura y ojos calados) para una sola tinta; no es el uso por defecto.
- **Iconos de plataforma** → assets, no CSS: `icon.svg` (favicon + PWA), `icon-256/512.png`,
  `apple-touch-icon.png` (Safari no admite SVG aquí), `favicon.ico` (16/32/48). Estos llevan **fondo
  squircle washi**; el componente in-app no.
- **Colores.** El **cuerpo** va con tokens (`--accent` → `--accent-strong`), que ya coinciden con el
  original, así que respira con el tema. La **cara** usa `--on-accent`. Ranura `#69291a`, ojo pintado
  `#1b1512` y ojo vacío `#bcb7af` son **literales de marca**: la única excepción admitida al §0, porque
  un logo no cambia de tono con el tema (el icono oficial es idéntico en Washi y en Sumi).
  En los assets el cuerpo va fijo `#c14b30 → #a2331c`; fondo washi `#f6f2ea → #eae1d1`, sumi `#4d4a47 → #100e0c`.
- **Zona de respeto**: el ancho de la ranura. **Tamaño mínimo 16 px** (por debajo, los ojos se pierden).
- **Nunca**: rotarlo, deformarlo, recolorear el cuerpo fuera del bermellón, meterlo en un disco/caja,
  ni pintar el segundo ojo fuera del estado logrado.

### 18.4 Archivos

`brand/` es la fuente de verdad (no entra en el build): `kobo-icon-{16,32,48,64,128,256,512}.png` ·
`kobo-icon-logrado-512.png` (dos ojos) · `kobo-icon-sumi-512.png` · `kobo-hanko-512.png` (disco washi) ·
`kobo-mark-{light,dark}-512.png` (monocromos). Detalle en [brand/README.md](brand/README.md).

El componente `<Hanko>` **ya no existe** (era el squircle con el glifo 工). Sus tres usos pasaron a
`<Daruma>`. Si algún día hace falta el disco de acento como recurso de énfasis, se crea aparte.

## 19. Escritorio — 卓上 (2026-08-06)

> Kobo nació mobile-first y **eso no cambia**: el móvil sigue siendo la referencia y ninguna regla de
> aquí puede degradarlo. Lo que cambia es que por debajo de `1024px` la app dejaba de existir como
> producto de escritorio: una tira de 460 px en mitad de un monitor, con la navegación a 15 cm del
> contenido. Esta sección es la doctrina para pantallas grandes. **Es de cumplimiento obligatorio**,
> igual que el resto del documento.

### 19.1 Breakpoints (solo dos, y con nombre)

| Nombre | Media query | Qué cambia |
| --- | --- | --- |
| **中 `md`** | `@media (min-width: 768px)` | La columna deja de estar clavada a 460 px (`--shell-max` → 680 px). Las **rejillas de tarjetas** pueden partirse en varias columnas. La navegación **sigue abajo** (una tableta se sostiene con las manos). Las hojas **siguen siendo hojas**. |
| **大 `lg`** | `@media (min-width: 1024px)` | **Shell de escritorio**: la navegación pasa a **rail lateral** izquierdo, desaparecen barra inferior y FAB, el contenido va a `--content-max` en rejilla, y las hojas se convierten en **modal centrado**. |

Reglas duras:

- **Solo estos dos umbrales.** Nada de breakpoints inventados por vista. Si una vista necesita partirse
  antes, que lo haga con `auto-fit` + `minmax()`, que no necesita media query ninguna.
- **Mobile-first**: el CSS base es el móvil; escritorio se añade **dentro** del `@media`, nunca al revés.
  Un `@media (max-width: …)` es señal de que la regla está escrita del revés.
- Los valores van **literales** en cada `@media` (una media query no puede leer `var()`); los tokens de
  layout de §19.2 sí son variables y se usan en las propiedades.

### 19.2 Tokens de layout

```css
--shell-max:   460px;  /* ancho de la columna en móvil (el de siempre) */
--content-max: 1180px; /* ancho útil del contenido en escritorio */
--rail:        232px;  /* ancho del rail de navegación lateral */
--header-h:    60px;   /* alto de la cabecera sticky: base de los `top` de sticky */
```

En `md`, `--shell-max` se redefine a `680px`. En `lg` el ancho lo manda `--content-max`.

### 19.3 Shell de escritorio (`lg`)

- **Rail lateral izquierdo** (`--rail`, fijo, alto completo, glass + borde derecho de 1px). De arriba
  abajo: **marca** (daruma + wordmark KOBO), los **5 destinos** y, abajo del todo (`margin-top: auto`),
  el botón **`+ Añadir`** — la píldora de acento que en móvil es el FAB.
- **Los destinos pasan a fila**: kanji/icono a la izquierda, etiqueta a la derecha, alineados a la
  izquierda. El activo ya no se marca solo con color: lleva **fondo `--accent-tint`** + texto `--accent`
  (a lo ancho de un rail, el color por sí solo no basta para leer "estoy aquí").
- **La marca sale de la cabecera** y sube al rail; la cabecera se queda con el **selector de mes** solo,
  alineado con el borde izquierdo del contenido. Sigue siendo sticky y glass.
- El brand del rail y el brand de la cabecera son **dos nodos distintos**, cada uno con su `@media`: uno
  vive oculto en cada modo. Mismo trato para el FAB y el `+ Añadir` del rail. Es duplicación consciente
  — CSS no mueve nodos de sitio — y el oculto va con `display: none`, que **sí** lo saca del árbol de
  accesibilidad (nada de lectores anunciando dos veces el mismo botón).
- **El scroll sigue viviendo en el documento**, no en un panel interno: un `overflow: auto` en el
  contenido rompería el sticky de la cabecera y el gesto de recargar.

### 19.4 Rejilla de contenido

- El contenido se centra a `--content-max` con `padding-inline` simétrico. La cabecera usa **el mismo
  cálculo** para que el mes quede a plomo con la primera tarjeta.
- **Dos formas de repartir, y solo dos:**
  1. **Columna principal + costado** (`grid-template-columns: minmax(300px, 380px) 1fr`) donde hay un
     resumen que merece quedarse a la vista: Taller (hero + ritmo | categorías), Gastos (resumen +
     filtros | días), Cuentas (patrimonio + rendimiento | cuentas). El costado va **`position: sticky`**
     bajo la cabecera (`top: calc(var(--header-h) + var(--space-4))`).
  2. **Rejilla fluida** (`repeat(auto-fit, minmax(320px, 1fr))` + `align-items: start`) donde solo hay
     una lista de tarjetas homogéneas: Meses, Ajustes, cuentas.
- **`display: contents` para agrupar sin tocar el móvil.** Cuando una vista necesita envolver hijos para
  formar columnas, el wrapper va con `display: contents` en móvil (el DOM se comporta como si no
  existiera: cero riesgo de regresión en la vista ya validada) y se convierte en `flex` dentro del
  `@media`. Esta es la técnica canónica del proyecto para adaptar una vista existente.
- **Nada de estirar filas a 1180 px.** Una fila de gasto de 1100 px de ancho con el importe perdido a la
  derecha es peor que la de móvil. Lo que no sea rejilla, se acota (`max-width` de ~720 px) o se parte.

### 19.5 Hojas → modal centrado (`lg`)

Mismo componente `BottomSheet`, otra piel: en `lg` el panel se **centra** en la pantalla, redondea las
cuatro esquinas, se acota a `520px` de ancho y `min(720px, 100% - 64px)` de alto, y **pierde el
grabber** (no hay nada que arrastrar con un ratón; en su lugar, más aire arriba).

- **La entrada cambia de gramática**: no desliza desde abajo (no hay "abajo" del que venir en el centro
  de un monitor), sino que **funde + sube 8 px + escala desde `0.98`** con `--ease-out` en `--dur-2`.
  El velo sigue fundiendo con el panel, como en §13.
- La curva `--ease-drawer` es **solo para hojas**: en el modal no se usa. Su frenada larga existe para
  dar peso a un recorrido de pantalla completa; en 8 px se lee como lentitud.
- La lógica de `visualViewport` (teclado de iOS) se queda intacta: en escritorio mide la pantalla entera
  y el centrado sale solo.

### 19.6 Puntero fino: hover, foco y cursor

- **Todo hover va dentro de `@media (hover: hover)`.** Sin ese guard, en táctil el estado se queda
  "pegado" tras el toque. Es regla dura, también en móvil.
- Hover = cambio **sutil** de superficie (`--surface-2`) o de tinta (`--ink-3` → `--ink`), en `--dur-1`.
  **Nunca** desplazamientos ni escalados al pasar por encima: el `:active` (escala `0.98`, §13) sigue
  siendo el único feedback de pulsación.
- `cursor: pointer` en todo lo accionable que no sea `<button>` nativo (filas, tarjetas-botón).
- El anillo `:focus-visible` de §14 es **más** importante en escritorio, no menos: es la única pista de
  dónde está el teclado. Ningún `outline: none` sin sustituto.

### 19.7 Checklist de escritorio (añadido al §16)

- [ ] Se ve bien a **1440 px** y a **1024 px** exactos (el umbral es donde se rompen las cosas).
- [ ] **Nada se estira** más allá de su ancho legible; ninguna fila cruza los 720 px.
- [ ] La navegación por **teclado** recorre cabecera → contenido → rail, con foco visible en todo.
      Ese es el orden del DOM y **no se cambia** para que coincida con el orden visual: el rail se pinta
      a la izquierda pero se tabula al final, igual que la barra inferior en móvil. Poner la navegación
      primero en el DOM obligaría a atravesar cinco destinos antes de llegar al saldo del mes, en las dos
      pantallas, para arreglar un salto que el anillo de foco ya explica.
- [ ] Los hover llevan `@media (hover: hover)` y no mueven nada de sitio.
- [ ] El **móvil sigue idéntico**: si el `@media` desaparece, la app es la de antes, píxel a píxel.
