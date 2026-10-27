import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMerchant, parseAmountToCents, matchRule } from './ingest.js';

test('parseAmountToCents: formatos que manda un iPhone', () => {
  assert.equal(parseAmountToCents('12,50 €'), 1250);
  assert.equal(parseAmountToCents('€12.50'), 1250);
  assert.equal(parseAmountToCents('12.50 EUR'), 1250);
  assert.equal(parseAmountToCents('12'), 1200);
  assert.equal(parseAmountToCents('0,99'), 99);
  assert.equal(parseAmountToCents('12.5'), 1250);
  // Espacio fino / no separable como separador de miles.
  assert.equal(parseAmountToCents('1 234,56 €'), 123456);
});

test('parseAmountToCents: miles y decimales en ambas convenciones', () => {
  assert.equal(parseAmountToCents('1.234,56'), 123456); // europeo
  assert.equal(parseAmountToCents('1,234.56'), 123456); // anglosajón
  assert.equal(parseAmountToCents('1.234.567,89'), 123456789);
  // Tres dígitos tras el último separador = miles, no decimales.
  assert.equal(parseAmountToCents('1.234'), 123400);
  assert.equal(parseAmountToCents('1,234'), 123400);
});

test('parseAmountToCents: nunca pierde un céntimo por redondeo (half-up)', () => {
  assert.equal(parseAmountToCents('12,3456'), 1235);
  assert.equal(parseAmountToCents('12,3444'), 1234);
  assert.equal(parseAmountToCents('0,005'), 1);
  assert.equal(parseAmountToCents('0,004'), 0);
  // El caso que rompe a los floats: 1.005 * 100 = 100.49999999999999 en binario.
  assert.equal(parseAmountToCents(1.005), 101);
  // Como TEXTO, en cambio, "1,005" son mil cinco euros: tres dígitos tras el
  // separador y parte entera no nula = miles. Un cobro de tarjeta nunca trae
  // tres decimales, así que la lectura de miles es la correcta aquí.
  assert.equal(parseAmountToCents('1,005'), 100500);
});

test('parseAmountToCents: números de JSON, sin floats de por medio', () => {
  assert.equal(parseAmountToCents(12.5), 1250);
  assert.equal(parseAmountToCents(0.1 + 0.2), 30);
  assert.equal(parseAmountToCents(1234), 123400);
});

test('parseAmountToCents: negativos (devoluciones) llegan con signo', () => {
  assert.equal(parseAmountToCents('-12,50 €'), -1250);
  assert.equal(parseAmountToCents('(12,50)'), -1250);
});

test('parseAmountToCents: basura devuelve null', () => {
  assert.equal(parseAmountToCents(''), null);
  assert.equal(parseAmountToCents('   '), null);
  assert.equal(parseAmountToCents('Mercadona'), null);
  assert.equal(parseAmountToCents('€'), null);
  assert.equal(parseAmountToCents(Number.NaN), null);
  assert.equal(parseAmountToCents(Number.POSITIVE_INFINITY), null);
  // Fuera del tope de cordura.
  assert.equal(parseAmountToCents('999999999999999'), null);
});

test('normalizeMerchant: mismo sitio escrito de cinco maneras', () => {
  assert.equal(normalizeMerchant('MERCADONA S.A. 4021'), 'mercadona s a 4021');
  assert.equal(normalizeMerchant('  Mercadona  '), 'mercadona');
  assert.equal(normalizeMerchant('Alcampo Móstoles'), 'alcampo mostoles');
  assert.equal(normalizeMerchant('CAFÉ & BAR'), 'cafe bar');
  assert.equal(normalizeMerchant(''), '');
});

test('matchRule: gana la regla más específica', () => {
  const rules = [{ match: 'mercadona' }, { match: 'mercadona online' }, { match: 'ikea' }];
  assert.equal(matchRule(rules, 'mercadona online 22')?.match, 'mercadona online');
  assert.equal(matchRule(rules, 'mercadona s a 4021')?.match, 'mercadona');
  assert.equal(matchRule(rules, 'carrefour express'), null);
  assert.equal(matchRule(rules, ''), null);
  assert.equal(matchRule([], 'mercadona'), null);
});

test('parseAmountToCents: un texto absurdamente largo no es un importe', () => {
  // Si en el Atajo se inserta la variable equivocada (la transacción entera en
  // vez de su Importe), lo correcto es descartarla, no sacarle dígitos.
  assert.equal(parseAmountToCents('x'.repeat(200)), null);
  assert.equal(parseAmountToCents(`Compra en MERCADONA ${'9'.repeat(80)}`), null);
  // El límite no estorba a ningún importe real, por adornado que venga.
  assert.equal(parseAmountToCents('  1.234.567,89 EUR  '), 123456789);
});
