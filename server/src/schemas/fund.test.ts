import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundCreateSchema, fundUpdateSchema } from './fund.js';

const CATEGORY = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SUBCATEGORY = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const base = {
  categoryId: CATEGORY,
  name: 'Gimnasio (pase)',
  targetCents: 15000,
  everyMonths: 4,
};

test('el fondo puede no tener subcategoría (sigue siendo de la categoría)', () => {
  const r = fundCreateSchema.safeParse(base);
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.subcategoryId, undefined);
});

test('acepta anclar el fondo a una subcategoría', () => {
  const r = fundCreateSchema.safeParse({ ...base, subcategoryId: SUBCATEGORY });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.subcategoryId, SUBCATEGORY);
});

test('rechaza una subcategoría que no es un ObjectId', () => {
  assert.equal(fundCreateSchema.safeParse({ ...base, subcategoryId: 'no-es-un-id' }).success, false);
});

test('al crear NO se admite null: o se ancla a algo, o se omite', () => {
  assert.equal(fundCreateSchema.safeParse({ ...base, subcategoryId: null }).success, false);
});

test('al editar, null desancla el fondo y ausente no toca nada', () => {
  const desanclar = fundUpdateSchema.safeParse({ subcategoryId: null });
  assert.equal(desanclar.success, true);
  if (desanclar.success) assert.equal(desanclar.data.subcategoryId, null);

  const soloNombre = fundUpdateSchema.safeParse({ name: 'Gimnasio' });
  assert.equal(soloNombre.success, true);
  if (soloNombre.success) assert.equal('subcategoryId' in soloNombre.data, false);
});

test('el objetivo sigue siendo dinero en céntimos (entero y positivo)', () => {
  assert.equal(fundCreateSchema.safeParse({ ...base, targetCents: 150.5 }).success, false);
  assert.equal(fundCreateSchema.safeParse({ ...base, targetCents: 0 }).success, false);
});
