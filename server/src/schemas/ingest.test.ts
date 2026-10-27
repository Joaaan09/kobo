import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestTransactionSchema } from './ingest.js';

/**
 * Estos tests existen por un fallo real: durante diez días **todos** los pagos
 * del iPhone se rechazaron con un 400 porque el Atajo mandaba `clientRef: ""`
 * (una variable que no resuelve no desaparece del JSON: llega vacía) y el
 * esquema lo declaraba `min(1)`. Un campo opcional de contexto tumbaba el pago.
 *
 * La regla que fijan: **lo único que puede abortar una ingesta es el importe**.
 */

test('el cuerpo real que manda un Atajo bien montado entra tal cual', () => {
  const r = ingestTransactionSchema.safeParse({
    amount: '12,50 €',
    merchant: 'MERCADONA S.A. 4021',
    card: 'Visa ••1234',
    clientRef: 'wallet-20260821-1432-12,50 €',
  });
  assert.equal(r.success, true);
  assert.deepEqual(r.success && r.data, {
    amount: '12,50 €',
    merchant: 'MERCADONA S.A. 4021',
    card: 'Visa ••1234',
    clientRef: 'wallet-20260821-1432-12,50 €',
  });
});

test('las variables vacías del Atajo desaparecen, no rompen el pago', () => {
  const r = ingestTransactionSchema.safeParse({
    amount: '12,50 €',
    merchant: '',
    card: '   ',
    clientRef: '',
    note: '',
    date: '',
  });
  assert.equal(r.success, true, 'un campo opcional vacío no puede tumbar un pago');
  const data = r.success ? r.data : null;
  assert.equal(data?.amount, '12,50 €');
  assert.equal(data?.clientRef, undefined);
  assert.equal(data?.merchant, undefined);
  assert.equal(data?.card, undefined);
  assert.equal(data?.date, undefined);
});

test('null tampoco rompe: se trata como ausente', () => {
  const r = ingestTransactionSchema.safeParse({
    amount: 12.5,
    merchant: null,
    card: null,
    clientRef: null,
    date: null,
    note: null,
  });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.amount, 12.5);
  assert.equal(r.success && r.data.merchant, undefined);
});

test('los textos largos se recortan, no se rechazan', () => {
  const r = ingestTransactionSchema.safeParse({
    amount: '3,20',
    merchant: 'M'.repeat(400),
    card: 'C'.repeat(400),
    note: 'N'.repeat(600),
  });
  assert.equal(r.success, true, 'un comercio largo no puede costar un gasto');
  assert.equal(r.success && r.data.merchant?.length, 140);
  assert.equal(r.success && r.data.card?.length, 80);
  assert.equal(r.success && r.data.note?.length, 280);
});

test('una fecha ilegible se ignora (el gasto se fecha al llegar)', () => {
  const r = ingestTransactionSchema.safeParse({ amount: '3,20', date: 'ayer por la tarde' });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.date, undefined);
});

test('una fecha válida sí se conserva', () => {
  const r = ingestTransactionSchema.safeParse({ amount: '3,20', date: '2026-08-21T10:15:00.000Z' });
  assert.equal(r.success, true);
  assert.equal(
    r.success && r.data.date instanceof Date && r.data.date.toISOString(),
    '2026-08-21T10:15:00.000Z',
  );
});

test('sin importe sí se rechaza, y con un motivo legible', () => {
  for (const body of [{}, { merchant: 'Mercadona' }, { amount: '' }, { amount: '   ' }]) {
    const r = ingestTransactionSchema.safeParse(body);
    assert.equal(r.success, false, `debería rechazar ${JSON.stringify(body)}`);
    assert.equal(r.success === false && r.error.issues[0]?.message, 'amount_required');
  }
});

test('amountCents acepta el número y también el texto que manda un Atajo', () => {
  assert.equal(ingestTransactionSchema.safeParse({ amountCents: 1250 }).success, true);
  const r = ingestTransactionSchema.safeParse({ amountCents: '1250' });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.amountCents, 1250);
  // Decimales en céntimos no son céntimos: se descarta y falta el importe.
  assert.equal(ingestTransactionSchema.safeParse({ amountCents: 12.5 }).success, false);
});
