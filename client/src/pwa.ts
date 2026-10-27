/**
 * Registra el service worker solo en producción. En dev se omite para evitar
 * cachés pegajosas mientras se itera con Vite/HMR.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW no registrado:', err);
    });
  });
}
