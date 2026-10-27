# brand/ — marca de Kobo

Assets oficiales de la marca. **Fuente de verdad**: el manual `KOBO Logo (offline).html` (local, fuera del
repo por peso) **referencia estos archivos** por ruta relativa — no lleva copias embebidas, así que un icono
solo se cambia aquí. No entran en el build: lo que sirve la app vive en
[client/public/](../client/public/). Reglas de uso en [DESIGN.md §18](../DESIGN.md).

## El símbolo

**達磨 daruma hucha**: el muñeco daruma se pinta un ojo al fijarse una meta y el otro al cumplirla;
la ranura de la coronilla lo convierte en hucha. Es el gesto de la app — repartes la nómina (un ojo)
y el mes cerrado dentro de presupuesto te devuelve el segundo.

**El estado de dos ojos no es el icono por defecto.** Solo para mes cerrado dentro de presupuesto.

## Archivos

| Archivo | Uso |
| --- | --- |
| `kobo-icon-{16,32,48,64,128,256,512}.png` | icono de app sobre washi (un ojo) |
| `kobo-icon-logrado-512.png` | estado logrado, dos ojos pintados |
| `kobo-icon-sumi-{256,512}.png` | icono sobre fondo sumi (el 256 es el del lockup oscuro) |
| `kobo-hanko-512.png` | 判子 — daruma sobre disco de papel |
| `kobo-mark-light-512.png` | monocromo claro (para fondos oscuros o bermellón) |
| `kobo-mark-dark-512.png` | monocromo tinta (para fondos claros) |

## Qué sirve la app

Derivados en `client/public/`, regenerables desde aquí:

- `icon.svg` — favicon + PWA. **Vectorial**, trazado del PNG de 512 con 0,8 px de error máximo.
- `icon-256.png`, `icon-512.png` — iconos PWA (`any` + `maskable`; el daruma cabe en la zona segura).
- `apple-touch-icon.png` — copia del 512 (Safari no admite SVG aquí).
- `favicon.ico` — contenedor con los PNG de 16/32/48.

El daruma monocromo in-app está en [`client/src/ui/Daruma.tsx`](../client/src/ui/Daruma.tsx)
(`currentColor`, ojos y ranura calados) y se usa dentro de `<Hanko>`.

**Mínimo 16 px.** Por debajo los ojos se pierden. Zona de respeto: el ancho de la ranura.
