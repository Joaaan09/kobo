/**
 * Smoke test end-to-end de las **notificaciones push** (通知) y del recordatorio
 * de fin de día.
 *
 * Lo que sí se puede comprobar sin un navegador de verdad: las rutas con sesión,
 * el alta/baja de suscripciones, las preferencias, la idempotencia del
 * recordatorio diario y —lo más importante— que **un fallo de notificación no
 * rompe la operación que la provoca** (el gasto se registra igual).
 *
 * Lo que NO puede comprobar: la entrega real al dispositivo. Los endpoints de
 * este test son falsos, así que `web-push` fallará al enviarlos: es lo esperado
 * y forma parte de la prueba (el error se traga, nunca sube).
 *
 * Uso (NUNCA contra la base de datos real — el script la borra al terminar):
 *
 *   MONGODB_URI='mongodb://…/kobo_smoke?authSource=admin' … npx tsx scripts/smoke-push.ts
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { env, pushEnabled } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Category } from '../src/models/Category.js';
import { ApiToken } from '../src/models/ApiToken.js';
import { Expense } from '../src/models/Expense.js';
import { PushSubscription } from '../src/models/PushSubscription.js';
import { generateApiToken } from '../src/auth/apiToken.js';
import { runDailyReminders } from '../src/services/reminders.js';

const DB_GUARD = /smoke|test/i;

/** Suscripción con la forma real de `PushManager.subscribe()`, pero inventada. */
function fakeSubscription(id: string) {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/smoke-${id}`,
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=',
      auth: 'tBHItJI5svbpez7KI4CCXg==',
    },
    userAgent: 'smoke-test',
  };
}

async function main() {
  if (!DB_GUARD.test(env.MONGODB_URI)) {
    throw new Error('Rechazado: la URI debe apuntar a una base de datos de prueba (…_smoke).');
  }

  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([PushSubscription.syncIndexes(), Expense.syncIndexes(), ApiToken.syncIndexes()]);

  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}/api`;

  const checks: string[] = [];
  const ok = (name: string) => checks.push(`  ✓ ${name}`);

  // ── Sesión real: registro y cookie, como haría la PWA.
  const registro = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'smoke-push@kobo.test', password: 'contrasena-larga' }),
  });
  assert.equal(registro.status, 201);
  const cookie = (registro.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(cookie, 'el registro debe devolver la cookie de sesión');
  ok('registro con sesión');

  const call = (path: string, method = 'GET', body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // 1. Sin sesión no se toca nada de push.
  assert.equal((await fetch(`${base}/push/config`)).status, 401);
  ok('sin sesión → 401');

  // 2. Config: dice si el servidor puede mandar push y con qué clave pública.
  const cfg = (await (await call('/push/config')).json()) as { data: Record<string, unknown> };
  assert.equal(cfg.data.enabled, pushEnabled);
  assert.equal(cfg.data.devices, 0);
  ok(`config expuesta (push ${pushEnabled ? 'activo' : 'sin claves VAPID'})`);

  // 3. Alta de dos dispositivos + reidempotencia del mismo endpoint.
  assert.equal((await call('/push/subscribe', 'POST', fakeSubscription('a'))).status, 201);
  assert.equal((await call('/push/subscribe', 'POST', fakeSubscription('b'))).status, 201);
  assert.equal((await call('/push/subscribe', 'POST', fakeSubscription('a'))).status, 201);
  assert.equal(await PushSubscription.countDocuments({}), 2);
  ok('alta de dispositivos; repetir el mismo endpoint no duplica');

  // 4. Baja.
  await call('/push/unsubscribe', 'POST', { endpoint: fakeSubscription('b').endpoint });
  assert.equal(await PushSubscription.countDocuments({}), 1);
  ok('baja de un dispositivo');

  // 5. Preferencias.
  const prefs = (await (
    await call('/push/prefs', 'PATCH', { ingest: 'all', dailyReminder: true, dailyHour: 0 })
  ).json()) as { data: { ingest: string; dailyReminder: boolean; dailyHour: number } };
  assert.equal(prefs.data.ingest, 'all');
  assert.equal(prefs.data.dailyReminder, true);
  assert.equal(prefs.data.dailyHour, 0);
  assert.equal((await call('/push/prefs', 'PATCH', { dailyHour: 99 })).status, 400);
  ok('preferencias guardadas; una hora inválida se rechaza');

  // 6. Recordatorio diario: avisa una vez y solo una.
  const user = await User.findOne({ email: 'smoke-push@kobo.test' });
  assert.ok(user);
  assert.equal(await runDailyReminders(), 1);
  const afterFirst = await User.findById(user!._id);
  assert.ok(afterFirst?.prefs.notifications.lastDailyKey, 'debe quedar marcado el día avisado');
  assert.equal(await runDailyReminders(), 0);
  ok('recordatorio diario: se envía una vez al día y no se repite');

  // 7. Un fallo de push NO puede tumbar la ingesta de un gasto.
  //    (Los endpoints son falsos: el envío fallará de verdad.)
  await Category.create({
    userId: user!._id,
    name: 'Variable',
    color: '#c9553b',
    percentBp: 3000,
    order: 0,
    flexible: true,
  });
  const { token, tokenHash, prefix } = generateApiToken();
  await ApiToken.create({ userId: user!._id, label: 'smoke', tokenHash, prefix });

  const ingesta = await fetch(`${base}/ingest/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount: '9,90', merchant: 'Prueba push' }),
  });
  assert.equal(ingesta.status, 201);
  assert.equal(await Expense.countDocuments({ userId: user!._id }), 1);
  ok('el gasto se registra aunque la notificación falle');

  console.log('\nNotificaciones push — smoke test\n' + checks.join('\n'));
  console.log('\n✅ Todo correcto.\n');

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
}

main().catch(async (err) => {
  console.error('\n❌ Smoke test fallido:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
