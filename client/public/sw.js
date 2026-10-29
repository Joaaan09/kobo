/* Kobo — service worker (app shell offline).
 * Estrategia:
 *  - /api y peticiones no-GET → siempre a red (nunca se cachean datos financieros).
 *  - Navegación (SPA) → network-first con fallback a index.html cacheado.
 *  - Assets same-origin con hash de Vite → cache-first (son inmutables).
 * Sube CACHE_VERSION al cambiar el shell para invalidar cachés viejas.
 */
// v20: filtro "Por revisar" permanente en Gastos (chip siempre visible, no solo al
// llegar desde la notificación). Subo la versión para purgar el shell cacheado y
// asegurar que el cliente arranca con el bundle nuevo.
// v6: "tirar para recargar". El gesto pide `registration.update()` antes de recargar,
// y eso solo trae versión nueva si ESTE archivo cambia byte a byte — de paso, subir la
// versión purga las cachés viejas del shell en el primer despliegue que lo incluye.
// v5: chrome del sistema por tema (theme-color light+dark igualadas y barra de estado
// de iOS). El index.html y el manifest cacheados traían los metas viejos, así que la
// PWA instalada seguiría arrancando con la franja del notch negra.
// v19: instalación guiada (アプリ en Ajustes + aviso del login).
// v18: notificaciones push (listeners `push` y `notificationclick` al final).
const CACHE_VERSION = 'kobo-v22';
// Solo lo imprescindible para arrancar offline. Los iconos pesados (apple-touch, PNG del
// manifest) NO entran: el SO ya los tiene tras instalar y precargarlos costaría ~430 KB a
// todo el mundo, también a quien nunca los usa. Caen en el cache-first de abajo si hacen falta.
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo GET del mismo origen. La API y el resto pasan directos a la red.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  // Navegación: network-first, fallback al shell (para que la SPA abra offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  // Assets estáticos: cache-first con revalidación en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});

/* ---------------------------------------------------------------------------
 * Notificaciones push (通知)
 * El servidor manda un JSON con { title, body, url, tag }. Si algo viniera mal
 * formado se muestra un aviso genérico: mejor una notificación pobre que ninguna.
 * ------------------------------------------------------------------------- */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Kobo';
  const options = {
    body: payload.body || '',
    icon: '/icon-256.png',
    badge: '/icon-256.png',
    tag: payload.tag || 'kobo',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Al tocar la notificación: reutiliza la ventana de Kobo si ya está abierta
 * (enfocarla y navegar) y solo abre una nueva si no hay ninguna. Abrir siempre
 * una pestaña más sería la forma rápida de acabar con diez Kobos abiertas. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
