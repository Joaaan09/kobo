<div align="center">

<img src="brand/kobo-icon-256.png" alt="Kobo" width="112" height="112">

# Kobo · 工房

**Taller de finanzas personales.** Pones tu nómina, la repartes por porcentaje en categorías
y ves en tiempo real cuánto te queda y a qué ritmo del mes vas.

PWA mobile-first · React + TypeScript · Express + MongoDB

[![CI](https://github.com/Joaaan09/kobo/actions/workflows/ci.yml/badge.svg)](https://github.com/Joaaan09/kobo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## Qué es

*Kōbō* (工房) significa **taller** en japonés. Kobo no es una plantilla financiera genérica ni un
método cerrado tipo Kakebo: es un taller donde construyes tu sistema con **tus reglas**.

El modelo es el de **sobres por porcentaje**:

1. Configuras tu **nómina** (fija o variable) y su día de ingreso.
2. La repartes en **categorías** por **%** (Vida 50 %, Ahorro 30 %…), con **subcategorías** dentro.
3. Registras **gastos** —a mano o solos desde el iPhone— y el panel te dice qué queda por gastar,
   cuánto llevas por categoría y si vas adelantado o retrasado respecto al **ritmo del mes**.

Lo que queda sin repartir se ve como **"sin asignar"**, para que ningún euro quede en tierra de nadie.

## Funcionalidades

| Vista | Qué hace |
| --- | --- |
| **Taller** (工房) | Panel del mes: carrusel *queda por gastar · restante del mes · patrimonio*, ritmo del mes y categorías con progreso y subcategorías |
| **Gastos** | Historial del mes agrupado por días, filtrable por categoría y por **«Por revisar»**; edición en línea |
| **Cuentas** | Cuentas y patrimonio: valoraciones, traspasos, intereses y revalorización, aportado vs. rendido |
| **Meses** | Histórico mensual: presupuesto, gastado y comparativa con el mes anterior |
| **Yo / Ajustes** | Nómina, reparto de categorías, fondos, automatización, notificaciones, módulos del panel y tema |

Y alrededor:

- **Ingesta automática** — un Atajo de iOS manda cada pago con Apple Pay a Kobo. Unas **reglas por
  comercio** (que Kobo aprende al clasificar) lo asignan a su categoría; lo que no encaja queda
  «Por revisar». Cada dispositivo tiene su propio token, revocable. → [docs/atajo-ios.md](docs/atajo-ios.md)
- **Notificaciones push** (Web Push, opcionales) — aviso de gasto entrante y recordatorio de fin de día
  para apuntar lo que la automatización no ve. → [docs/notificaciones.md](docs/notificaciones.md)
- **Fondos de previsión** (積立) — gastos grandes y periódicos (seguro, ITV…) que se reservan un poco
  cada mes y se pagan cuando tocan.
- **Categorías comodín** — partidas sin destino fijo cuyo presupuesto se reparte entre otras cada mes,
  sin crear ni destruir dinero.
- **PWA instalable** — standalone, arranque offline del *app shell*, guía de instalación por plataforma
  (iPhone · Android · ordenador) y diseño de dos columnas en escritorio.
- **Dos temas** — 和紙 *Washi* (papel claro) y 墨 *Sumi* (tinta oscura), o automático según el sistema.

## Cómo trata el dinero

> **El dinero es sagrado.** Todos los importes son **enteros en céntimos** y los porcentajes,
> **puntos básicos** (`2350` = 23,50 %). Nunca floats. El formateo a `€` ocurre solo en la UI.

- **Presupuesto** (flujo del mes) y **patrimonio** (lo que tienes) son dos ejes que no se mezclan:
  ahorrar o reservar para un fondo baja lo que queda por gastar, pero no tu patrimonio.
- La aritmética delicada (reparto, fondos, rendimiento) vive en funciones puras con tests.

## Stack

- **client/** — React 18 + Vite + TypeScript. Estilos con **tokens CSS + CSS Modules** (sin Tailwind).
  Fuente **Shippori Mincho** autoalojada. Service worker propio.
- **server/** — Node 20 + Express + TypeScript + Mongoose sobre MongoDB. API REST bajo `/api`,
  auth **JWT** en cookie `httpOnly`, validación con **zod**, `helmet` + `cors`, `web-push`.
- **Despliegue** — Docker Compose: Nginx (SPA + proxy de `/api`), backend y `mongo:7`, pensado para
  ir detrás de un proxy inverso que termine TLS.

```
kobo/
├── client/            PWA (React + Vite)
│   ├── public/        manifest, iconos y service worker
│   └── src/
│       ├── views/     Taller, Gastos, Cuentas, Meses, Yo, Login
│       ├── features/  flujos transversales (añadir movimiento, instalación)
│       ├── shell/     cabecera, navegación inferior, tirar para recargar
│       ├── ui/        componentes base (hojas, filas, chips…)
│       └── styles/    tokens CSS de los dos temas
├── server/            API (Express + Mongoose)
│   ├── src/
│   │   ├── routes/    endpoints bajo /api
│   │   ├── schemas/   validación zod (+ tests)
│   │   ├── services/  lógica de dominio pura (+ tests)
│   │   └── models/    modelos Mongoose
│   └── scripts/       seed y smoke tests
├── brand/             iconos y marca
├── docs/              guías de uso
├── DESIGN.md          sistema de diseño
└── docker-compose.yml
```

## Puesta en marcha (local)

Necesitas **Node 20+** y una MongoDB. Si no tienes una, levanta una de usar y tirar que encaje con
la URI de ejemplo:

```bash
docker run -d --name kobo-mongo-dev -p 127.0.0.1:27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=kobo -e MONGO_INITDB_ROOT_PASSWORD=CHANGEME mongo:7
```

Luego:

```bash
npm run install:all                 # raíz + client + server

cp server/.env.example server/.env  # MONGODB_URI y los dos secretos JWT
cp client/.env.example client/.env  # normalmente no hace falta tocarlo

npm run dev                         # client :5173 + server :4100
```

Abre <http://localhost:5173> y **crea una cuenta** desde la pantalla de acceso. Si prefieres empezar
con datos, rellena `SEED_*` en `server/.env` y ejecuta `npm --prefix server run seed`: crea un usuario,
su nómina y cuatro categorías de ejemplo. Sin esas variables el seed aborta en vez de crear un usuario
con credenciales conocidas.

### Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Cliente (Vite, `:5173`) y servidor (`:4100`) con `concurrently` |
| `npm run build` | Build de ambos (`tsc` + `vite build`) |
| `npm run typecheck` | Typecheck de ambos, sin emitir |
| `npm test` | Tests unitarios del servidor (`node --test`, no necesitan Mongo) |
| `npm run install:all` | Instala dependencias en raíz, `client/` y `server/` |
| `npm --prefix server run seed` | Usuario inicial con nómina y categorías de ejemplo |
| `npm --prefix server run smoke:{ingest,push,funds}` | Pruebas *end-to-end* contra una Mongo real |

Los **smoke tests** levantan la API de verdad y **borran la base de datos al terminar**. Por eso se
niegan a correr si `MONGODB_URI` no apunta a una base cuyo nombre contenga `smoke` o `test`
(p. ej. `…/kobo_smoke?authSource=admin`). Nunca los lances contra tus datos.

El CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) pasa typecheck, tests y build en cada
push y PR a `main` y `staging`.

## Despliegue

```bash
cp .env.example .env    # rellena los secretos: openssl rand -base64 32
docker compose up -d --build
```

El compose levanta tres contenedores:

- **`kobo-frontend`** — Nginx sirve la SPA y proxya `/api` al backend. Solo `expose 80`, sin publicar
  puertos al host: lo alcanza tu proxy inverso por la red externa `reverse_proxy_network`.
- **`kobo-backend`** — Express en la red privada `internal`, `expose 4000`, con healthcheck.
- **`kobo-mongo`** — `mongo:7` con autenticación y volumen persistente. **No publica puerto**.

El compose asume un proxy inverso (en mi caso **Nginx Proxy Manager**) que termina TLS y comparte la
red `reverse_proxy_network`. Si no existe, créala con `docker network create reverse_proxy_network`
o adapta la sección `networks` a tu proxy. Kobo **necesita HTTPS** en producción: las cookies de
sesión son `secure` y el service worker y las push solo funcionan en origen seguro.

### Variables de entorno (`.env` de la raíz)

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `MONGO_USER`, `MONGO_PASSWORD` | Sí | Usuario root del contenedor de Mongo |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Sí | Firmar las sesiones (≥ 16 caracteres; el backend no arranca sin ellos) |
| `CLIENT_ORIGIN` | Sí | Origen público de la app, para CORS (`https://kobo.tudominio.com`) |
| `VITE_API_URL` | No | URL de la API en el build del cliente. Por defecto `/api` (mismo origen) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No | Notificaciones push. Genera el par con `npx web-push generate-vapid-keys`. Si faltan, Kobo arranca igual y la UI indica que las push están desactivadas |

Si alguna vez regeneras `MONGO_PASSWORD` con el volumen ya creado, Mongo no actualiza el usuario root:
[scripts/fix-mongo-auth.sh](scripts/fix-mongo-auth.sh) lo resincroniza sin tocar los datos.

## Seguridad

Kobo guarda datos financieros personales, así que el borde va blindado:

- **JWT obligatorio** en todo endpoint privado; cookies `httpOnly` + `secure` + `sameSite`.
- **Aislamiento por usuario**: toda query filtra por el `userId` de la sesión (sin IDOR).
- **Validación con zod** en el backend de cada entrada: importes, porcentajes y fechas incluidos.
- El token de ingesta del Atajo de iOS **solo puede crear gastos**: no lee datos ni hereda el resto
  de la API, tiene límite de peticiones y se revoca por dispositivo. Kobo solo guarda su hash.
- Secretos siempre por `.env` (fuera del repo): nunca en el código, en logs ni en el cliente.

Si encuentras una vulnerabilidad, por favor **no abras un issue público**: avísame por un
[aviso de seguridad privado](https://github.com/Joaaan09/kobo/security/advisories/new).

## Alcance y limitaciones

Kobo nació como herramienta personal y se nota en algunas decisiones:

- **España**: euros, formato `es-ES` y zona horaria `Europe/Madrid` fijos. El cálculo de intereses
  contempla la retención de Hacienda.
- **Histórico en vivo**: los meses pasados se calculan con la nómina y los % **actuales**, así que
  cambiarlos hoy también cambia cómo se ve el pasado. Congelar cada mes en un *snapshot* está pendiente.
- **Registro abierto**: cualquiera que llegue a tu instancia puede crear una cuenta (aislada de las
  demás). Si la despliegas solo para ti, restringe el acceso en el proxy.
- **Una sola réplica**: el recordatorio diario corre en el propio proceso del backend; con varias
  réplicas avisaría varias veces.
- **Ingesta automática solo en iOS**: depende de las automatizaciones de Atajos con Apple Pay.

## Documentación

| Archivo | Contenido |
| --- | --- |
| [DESIGN.md](DESIGN.md) | Sistema de diseño completo: tokens, temas Washi/Sumi, tipografía, motion, escritorio. **De cumplimiento obligatorio para cualquier cambio visual.** |
| [docs/atajo-ios.md](docs/atajo-ios.md) | Registrar gastos automáticamente desde un Atajo de iOS |
| [docs/notificaciones.md](docs/notificaciones.md) | Activar y ajustar las notificaciones push |
| [brand/](brand/) | Iconos y marca (daruma hucha, hanko 判子, wordmark 工房, monocromos) |

DESIGN.md cita a menudo dos mockups offline (`KOBO App (offline).html` y `KOBO Logo (offline).html`):
pesan ~1 MB y no están en el repo; todo lo que definen está destilado en DESIGN.md.

## Convenciones

- **Idioma**: identificadores en inglés; comentarios, documentación y UI en español.
- **Ramas**: `main` (solo cambios validados) y `staging` (todo el desarrollo). Las ramas de feature
  salen de `staging` y vuelven a `staging`; el merge a `main` es el último paso.
- **Dinero**: enteros en céntimos, siempre.
- **Estilos**: solo tokens CSS del sistema, cero colores literales.

## Licencia

[MIT](LICENSE) — © 2026 Joaaan09.
