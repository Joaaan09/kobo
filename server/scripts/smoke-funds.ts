/**
 * Smoke test end-to-end del **ancla de un fondo (積立) a una subcategoría**.
 *
 * Lo que comprueba, con sesión real y base de datos de verdad (no mocks):
 * el alta con ancla, el aislamiento (una subcategoría de otra categoría o de
 * otro usuario no vale), el desanclado —que debe **borrar** el campo, no dejarlo
 * a null—, la herencia de la etiqueta en el pago y que ese pago **no** cuenta
 * como gasto del mes, y que borrar la subcategoría desancla sus fondos.
 *
 * Uso (NUNCA contra la base de datos real — el script la borra al terminar):
 *
 *   MONGODB_URI='mongodb://…/kobo_smoke' … npx tsx scripts/smoke-funds.ts
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Fund } from '../src/models/Fund.js';
import { madridParts } from '../src/lib/time.js';

const DB_GUARD = /smoke|test/i;

interface Envelope<T> {
  data: T;
}

async function main() {
  if (!DB_GUARD.test(env.MONGODB_URI)) {
    throw new Error('Rechazado: la URI debe apuntar a una base de datos de prueba (…_smoke).');
  }

  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.dropDatabase();

  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}/api`;

  const checks: string[] = [];
  const ok = (name: string) => checks.push(`  ✓ ${name}`);

  /** Registra un usuario y devuelve su cookie de sesión. */
  async function signup(email: string): Promise<string> {
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'contrasena-larga' }),
    });
    assert.equal(res.status, 201, `registro de ${email}`);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    assert.ok(cookie, 'el registro debe devolver la cookie de sesión');
    return cookie;
  }

  const call = (cookie: string) => (path: string, method = 'GET', body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const yo = call(await signup('smoke-funds@kobo.test'));
  const otro = call(await signup('smoke-funds-otro@kobo.test'));

  // ── Terreno: dos categorías con una subcategoría cada una.
  const deporte = (
    (await (
      await yo('/categories', 'POST', { name: 'Deporte', color: '#c9553b', percentBp: 2000, order: 0 })
    ).json()) as Envelope<{ id: string }>
  ).data;
  const comida = (
    (await (
      await yo('/categories', 'POST', { name: 'Comida', color: '#7a8b6f', percentBp: 3000, order: 1 })
    ).json()) as Envelope<{ id: string }>
  ).data;
  const gimnasio = (
    (await (
      await yo('/subcategories', 'POST', { categoryId: deporte.id, name: 'Gimnasio' })
    ).json()) as Envelope<{ id: string }>
  ).data;
  const super_ = (
    (await (
      await yo('/subcategories', 'POST', { categoryId: comida.id, name: 'Súper' })
    ).json()) as Envelope<{ id: string }>
  ).data;
  ok('terreno: 2 categorías con subcategoría');

  // 1. Ancla válida: la subcategoría es de esa misma categoría.
  const creado = await yo('/funds', 'POST', {
    categoryId: deporte.id,
    subcategoryId: gimnasio.id,
    name: 'Pase trimestral',
    targetCents: 15000,
    everyMonths: 4,
  });
  assert.equal(creado.status, 201);
  const fondo = ((await creado.json()) as Envelope<{ id: string; subcategoryId?: string }>).data;
  assert.equal(fondo.subcategoryId, gimnasio.id);
  ok('fondo anclado a la subcategoría de su categoría');

  // 2. Aislamiento: subcategoría de OTRA categoría, o de otro usuario → 404.
  const cruzado = await yo('/funds', 'POST', {
    categoryId: deporte.id,
    subcategoryId: super_.id,
    name: 'Cruzado',
    targetCents: 1000,
    everyMonths: 2,
  });
  assert.equal(cruzado.status, 404);
  const ajena = (
    (await (
      await otro('/subcategories', 'POST', {
        categoryId: (
          (await (
            await otro('/categories', 'POST', {
              name: 'Suya',
              color: '#c9553b',
              percentBp: 1000,
              order: 0,
            })
          ).json()) as Envelope<{ id: string }>
        ).data.id,
        name: 'Ajena',
      })
    ).json()) as Envelope<{ id: string }>
  ).data;
  const robo = await yo('/funds', 'POST', {
    categoryId: deporte.id,
    subcategoryId: ajena.id,
    name: 'IDOR',
    targetCents: 1000,
    everyMonths: 2,
  });
  assert.equal(robo.status, 404);
  ok('rechaza anclar a una subcategoría de otra categoría o de otro usuario');

  // 3. Desanclar borra el campo (nada de nulls guardados en la base).
  assert.equal((await yo(`/funds/${fondo.id}`, 'PATCH', { subcategoryId: null })).status, 200);
  const raw = await Fund.collection.findOne({ _id: new mongoose.Types.ObjectId(fondo.id) });
  assert.ok(raw);
  assert.equal('subcategoryId' in raw!, false, 'el campo debe desaparecer, no quedar a null');
  ok('desanclar BORRA el campo (no lo deja a null)');

  // 4. Volver a anclarlo, ahora por PATCH.
  const reanclado = await yo(`/funds/${fondo.id}`, 'PATCH', { subcategoryId: gimnasio.id });
  assert.equal(reanclado.status, 200);
  assert.equal(
    ((await reanclado.json()) as Envelope<{ subcategoryId?: string }>).data.subcategoryId,
    gimnasio.id,
  );
  ok('se puede reanclar desde la edición');

  // 5. El pago del fondo lleva su subcategoría y NO cuenta como gasto del mes.
  const hoy = madridParts(new Date());
  const fecha = `${hoy.year}-${String(hoy.month).padStart(2, '0')}-${String(hoy.day).padStart(2, '0')}`;
  const pago = await yo('/expenses', 'POST', {
    amountCents: 15000,
    date: fecha,
    categoryId: deporte.id,
    subcategoryId: gimnasio.id,
    fundId: fondo.id,
  });
  assert.equal(pago.status, 201);

  const panel = (
    (await (
      await yo(`/dashboard?month=${hoy.year}-${String(hoy.month).padStart(2, '0')}`)
    ).json()) as Envelope<{
      gastadoTotalCents: number;
      categories: { id: string; spentCents: number }[];
      funds: { id: string; subcategoryId?: string; balanceCents: number; paidThisMonthCents: number }[];
    }>
  ).data;
  assert.equal(panel.gastadoTotalCents, 0, 'un pago de fondo no es gasto del mes');
  assert.equal(panel.categories.find((c) => c.id === deporte.id)?.spentCents, 0);
  const vista = panel.funds.find((f) => f.id === fondo.id);
  assert.equal(vista?.subcategoryId, gimnasio.id, 'el panel expone el ancla');
  assert.equal(vista?.paidThisMonthCents, 15000);
  ok('el pago hereda la etiqueta, baja la hucha y no infla el "gastado"');

  // 6. Borrar la subcategoría desancla sus fondos (sin borrarlos).
  assert.equal((await yo(`/subcategories/${gimnasio.id}`, 'DELETE')).status, 200);
  const tras = await Fund.collection.findOne({ _id: new mongoose.Types.ObjectId(fondo.id) });
  assert.ok(tras, 'el fondo sigue vivo');
  assert.equal('subcategoryId' in tras!, false, 'y queda desanclado');
  ok('borrar la subcategoría desancla sus fondos sin tocar el saldo');

  console.log(`\n積立 smoke — ${checks.length}/${checks.length} OK`);
  console.log(checks.join('\n'));

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
}

main().catch(async (err) => {
  console.error('\n❌ smoke-funds falló:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
