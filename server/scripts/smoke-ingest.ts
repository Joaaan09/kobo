/**
 * Smoke test end-to-end de la **ingesta automática** (自動).
 *
 * Levanta la app real contra una base de datos **de usar y tirar** y ejerce el
 * camino completo del Atajo de iOS: token → HTTP → gasto creado → patrimonio
 * descontado. Cubre lo que los tests unitarios no pueden ver (índices, rutas,
 * middleware, idempotencia).
 *
 * Uso (NUNCA contra la base de datos real — el script la borra al terminar):
 *
 *   MONGODB_URI='mongodb://…/kobo_smoke?authSource=admin' \
 *   JWT_ACCESS_SECRET=x… JWT_REFRESH_SECRET=x… npx tsx scripts/smoke-ingest.ts
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Category } from '../src/models/Category.js';
import { Account } from '../src/models/Account.js';
import { ApiToken } from '../src/models/ApiToken.js';
import { IngestRule } from '../src/models/IngestRule.js';
import { Expense } from '../src/models/Expense.js';
import { generateApiToken } from '../src/auth/apiToken.js';

const DB_GUARD = /smoke|test/i;

async function main() {
  if (!DB_GUARD.test(env.MONGODB_URI)) {
    throw new Error('Rechazado: la URI debe apuntar a una base de datos de prueba (…_smoke).');
  }

  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  // Los índices se crean a mano: sin esto, la unicidad de clientRef no aplica.
  await Promise.all([Expense.syncIndexes(), ApiToken.syncIndexes(), IngestRule.syncIndexes()]);

  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/api/ingest/transaction`;

  // ── Datos mínimos: usuario, categorías (una comodín) y cuenta con saldo.
  const user = await User.create({ email: 'smoke@kobo.test', passwordHash: 'x' });
  const comodin = await Category.create({
    userId: user._id,
    name: 'Variable',
    color: '#c9553b',
    percentBp: 3000,
    order: 1,
    flexible: true,
  });
  const comida = await Category.create({
    userId: user._id,
    name: 'Comida',
    color: '#4b6b52',
    percentBp: 2000,
    order: 0,
  });
  const account = await Account.create({
    userId: user._id,
    name: 'Banco',
    order: 0,
    buckets: [{ name: 'Corriente', balanceCents: 100_000, kind: 'cash' }],
  });
  const bucketId = account.buckets[0]._id;

  const { token, tokenHash, prefix } = generateApiToken();
  await ApiToken.create({
    userId: user._id,
    label: 'iPhone · smoke',
    tokenHash,
    prefix,
    accountId: account._id,
    bucketId,
  });

  const post = (body: unknown, auth = `Bearer ${token}`) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });

  const checks: string[] = [];
  const ok = (name: string) => checks.push(`  ✓ ${name}`);

  // 1. Sin token → 401.
  assert.equal((await post({ amount: '10' }, '')).status, 401);
  ok('sin token → 401');

  // 2. Token inválido → 401.
  assert.equal((await post({ amount: '10' }, 'Bearer kobo_falso')).status, 401);
  ok('token inválido → 401');

  // 3. Pago sin regla → gasto en la comodín, marcado por revisar, patrimonio abajo.
  let res = await post({ amount: '12,50 €', merchant: 'MERCADONA S.A. 4021', card: 'Visa' });
  let json = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
  assert.equal(res.status, 201);
  assert.equal(json.data.amountCents, 1250);
  assert.equal(json.data.needsReview, true);
  assert.equal(json.data.categoryId, String(comodin._id));
  ok('sin regla → comodín + por revisar (12,50 € parseado de "12,50 €")');

  let fresh = await Account.findById(account._id);
  assert.equal(fresh?.buckets.id(bucketId)?.balanceCents, 100_000 - 1250);
  ok('el saldo de la cuenta baja 12,50 €');

  // 4. Con regla → categoría correcta y sin revisión.
  await IngestRule.create({
    userId: user._id,
    match: 'mercadona',
    label: 'Mercadona',
    categoryId: comida._id,
  });
  res = await post({ amount: '30,00', merchant: 'Mercadona 3312' });
  json = (await res.json()) as typeof json;
  assert.equal(json.data.categoryId, String(comida._id));
  assert.equal(json.data.needsReview, false);
  ok('con regla → Comida, sin revisión (el nombre sucio caza igual)');

  const rule = await IngestRule.findOne({ userId: user._id, match: 'mercadona' });
  assert.equal(rule?.hits, 1);
  ok('la regla contabiliza su uso');

  // 5. Idempotencia: el mismo clientRef dos veces = un solo gasto.
  const ref = 'wallet-2026-08-06-0001';
  const first = (await (await post({ amount: '9,99', clientRef: ref })).json()) as typeof json;
  const second = (await (await post({ amount: '9,99', clientRef: ref })).json()) as typeof json;
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.id, first.data.id);
  assert.equal(await Expense.countDocuments({ userId: user._id, clientRef: ref }), 1);
  ok('reintento con el mismo clientRef → no duplica');

  // 6. Importes que no son un gasto.
  assert.equal((await post({ amount: '-12,50' })).status, 400);
  assert.equal((await post({ amount: '0,00' })).status, 400);
  assert.equal((await post({ amount: 'no soy un importe' })).status, 400);
  assert.equal((await post({ merchant: 'sin importe' })).status, 400);
  ok('devolución, importe cero y basura → 400 (no ensucian el presupuesto)');

  // 6.b. El cuerpo REAL de un Atajo con variables sin resolver: las claves llegan
  //       vacías, no ausentes. Esto rechazó todos los pagos durante diez días.
  res = await post({
    amount: '4,20 €',
    merchant: '',
    card: '   ',
    clientRef: '',
    note: '',
    date: '',
  });
  assert.equal(res.status, 201, 'un campo opcional vacío no puede tumbar un pago real');
  ok('campos vacíos del Atajo → el pago entra igual (solo el importe manda)');

  // 6.c. Y un rechazo deja rastro: la ingesta ya no falla en silencio.
  assert.equal((await post({ merchant: 'sin importe' })).status, 400);
  const marcado = await ApiToken.findOne({ tokenHash });
  assert.equal(marcado?.lastFailureReason, 'amount_required');
  assert.ok(marcado?.lastFailureAt instanceof Date);
  ok('un rechazo queda anotado en el dispositivo (motivo + fecha)');

  // 7. Token revocado → 401.
  await ApiToken.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
  assert.equal((await post({ amount: '5' })).status, 401);
  ok('token revocado → 401');

  // 8. Aislamiento: el token de otro usuario no ve estos gastos.
  const total = await Expense.countDocuments({ userId: user._id });
  assert.equal(total, 4);
  ok(`gastos creados en total: ${total} (los 4 válidos, ni uno más)`);

  console.log('\nIngesta automática — smoke test\n' + checks.join('\n'));
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
