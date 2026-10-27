import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldReparto, effectiveAssignedCents, type RepartoDist } from './reparto.js';

const live = new Set(['comodin', 'ahorro', 'ocio', 'vida']);
const flexibles = new Set(['comodin']);

/** Suma de los valores de un Map (para comprobar la neutralidad). */
function sum(map: Map<string, number>): number {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
}

test('reparte todo el comodín entre dos destinos (neutro)', () => {
  const dists: RepartoDist[] = [
    {
      categoryId: 'comodin',
      shares: [
        { toCategoryId: 'ahorro', amountCents: 4000 },
        { toCategoryId: 'ocio', amountCents: 2000 },
      ],
    },
  ];
  const { received, distributed } = foldReparto(dists, live, flexibles);
  assert.equal(received.get('ahorro'), 4000);
  assert.equal(received.get('ocio'), 2000);
  assert.equal(distributed.get('comodin'), 6000);
  // Neutralidad: lo recibido total == lo repartido total.
  assert.equal(sum(received), sum(distributed));
});

test('un destino borrado NO descuadra el total (se ignora en ambos lados)', () => {
  const dists: RepartoDist[] = [
    {
      categoryId: 'comodin',
      shares: [
        { toCategoryId: 'ahorro', amountCents: 4000 },
        { toCategoryId: 'fantasma', amountCents: 2000 }, // categoría ya no viva
      ],
    },
  ];
  const { received, distributed } = foldReparto(dists, live, flexibles);
  assert.equal(received.get('ahorro'), 4000);
  assert.equal(received.get('fantasma'), undefined);
  // El comodín solo "reparte" lo que llega a un destino vivo → sigue cuadrando.
  assert.equal(distributed.get('comodin'), 4000);
  assert.equal(sum(received), sum(distributed));
});

test('un origen que ya no es comodín se ignora por completo', () => {
  const dists: RepartoDist[] = [
    { categoryId: 'ahorro', shares: [{ toCategoryId: 'ocio', amountCents: 5000 }] },
  ];
  const { received, distributed } = foldReparto(dists, live, flexibles);
  assert.equal(received.size, 0);
  assert.equal(distributed.size, 0);
});

test('descarta el tramo hacia sí mismo y los importes ≤ 0', () => {
  const dists: RepartoDist[] = [
    {
      categoryId: 'comodin',
      shares: [
        { toCategoryId: 'comodin', amountCents: 3000 }, // a sí mismo
        { toCategoryId: 'vida', amountCents: 0 }, // sin importe
        { toCategoryId: 'ahorro', amountCents: 1500 },
      ],
    },
  ];
  const { received, distributed } = foldReparto(dists, live, flexibles);
  assert.equal(received.get('comodin'), undefined);
  assert.equal(received.get('vida'), undefined);
  assert.equal(received.get('ahorro'), 1500);
  assert.equal(distributed.get('comodin'), 1500);
  assert.equal(sum(received), sum(distributed));
});

test('varios comodines suman en el mismo destino y siguen cuadrando', () => {
  const live2 = new Set(['c1', 'c2', 'ahorro']);
  const flex2 = new Set(['c1', 'c2']);
  const dists: RepartoDist[] = [
    { categoryId: 'c1', shares: [{ toCategoryId: 'ahorro', amountCents: 1000 }] },
    { categoryId: 'c2', shares: [{ toCategoryId: 'ahorro', amountCents: 2500 }] },
  ];
  const { received, distributed } = foldReparto(dists, live2, flex2);
  assert.equal(received.get('ahorro'), 3500);
  assert.equal(distributed.get('c1'), 1000);
  assert.equal(distributed.get('c2'), 2500);
  assert.equal(sum(received), sum(distributed));
});

test('effectiveAssignedCents: base + recibido − repartido, nunca negativo', () => {
  assert.equal(effectiveAssignedCents(10000, 0, 6000), 4000); // comodín reparte 60 €
  assert.equal(effectiveAssignedCents(10000, 4000, 0), 14000); // destino recibe 40 €
  assert.equal(effectiveAssignedCents(5000, 0, 8000), 0); // repartió más que su base → 0
});
