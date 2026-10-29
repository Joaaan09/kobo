import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { startDailyReminders } from './services/reminders.js';
import { startSubscriptionScheduler } from './services/subscriptions.js';

async function main() {
  await connectDB();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`🚀 Kobo API escuchando en :${env.PORT} (${env.NODE_ENV})`);
  });
  // Recordatorio de fin de día. No-op si no hay claves VAPID configuradas.
  startDailyReminders();
  // Cargos de suscripciones (定期): se apuntan solos el día que tocan.
  startSubscriptionScheduler();
}

main().catch((err) => {
  console.error('❌ Fallo al arrancar el servidor:', err);
  process.exit(1);
});
