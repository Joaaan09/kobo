import { Types } from 'mongoose';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { Valuation } from '../models/Valuation.js';
import { splitPatrimonyChange } from './rendimiento.js';
import { TZ } from '../lib/time.js';

/**
 * Variación del patrimonio de un mes, descompuesta en lo que **aportaste** tú y
 * lo que **rindió** el dinero solo. La identidad `delta = aportado + rendimiento`
 * se cumple exacta por construcción (ver `splitPatrimonyChange`).
 */
export interface PatrimonyChange {
  aportadoCents: number;
  rendimientoCents: number;
  deltaCents: number;
}

/** Agrupación 'YYYY-MM' en zona Europe/Madrid (misma clave que usa `/months`). */
const monthKey = { $dateToString: { date: '$date', format: '%Y-%m', timezone: TZ } };

/**
 * Variación del patrimonio mes a mes, indexada por 'YYYY-MM'.
 *
 * Qué cuenta y qué no (el dinero es sagrado):
 * - **Aportado** = ingresos − gastos que **tocan una cuenta** (`accountId`). Un
 *   gasto histórico sin cuenta (`affectsPatrimony: false`) no movió saldo, así que
 *   tampoco mueve esta cifra.
 * - **Rendimiento** = Σ `deltaCents` de las valoraciones (intereses + revalorización).
 * - Los **traspasos** no aparecen: son neutros por definición (Σ saldos constante).
 * - Los **ajustes manuales de saldo** (reconciliación en el sub-saldo) tampoco: no
 *   son un hecho económico atribuible a un mes, son corregir lo que ya pasó.
 *
 * La atribución es por **fecha del evento** (no por cuándo se registró): un gasto
 * fechado en marzo pertenece a marzo aunque lo apuntes hoy.
 */
export async function patrimonyChangeByMonth(
  userId: string,
): Promise<Map<string, PatrimonyChange>> {
  const uid = new Types.ObjectId(userId);
  // Solo lo que movió saldo de verdad: con cuenta enlazada.
  const linked = { userId: uid, accountId: { $ne: null } };

  const [outAgg, inAgg, yieldAgg] = await Promise.all([
    Expense.aggregate<{ _id: string; total: number }>([
      { $match: linked },
      { $group: { _id: monthKey, total: { $sum: '$amountCents' } } },
    ]),
    Income.aggregate<{ _id: string; total: number }>([
      { $match: linked },
      { $group: { _id: monthKey, total: { $sum: '$amountCents' } } },
    ]),
    Valuation.aggregate<{ _id: string; total: number }>([
      { $match: { userId: uid } },
      { $group: { _id: monthKey, total: { $sum: '$deltaCents' } } },
    ]),
  ]);

  const flows = new Map<string, number>(); // ingresos − gastos, por mes
  for (const row of inAgg) flows.set(row._id, (flows.get(row._id) ?? 0) + row.total);
  for (const row of outAgg) flows.set(row._id, (flows.get(row._id) ?? 0) - row.total);

  const yields = new Map<string, number>();
  for (const row of yieldAgg) yields.set(row._id, row.total);

  const result = new Map<string, PatrimonyChange>();
  for (const key of new Set([...flows.keys(), ...yields.keys()])) {
    const aportado = flows.get(key) ?? 0;
    const rendimiento = yields.get(key) ?? 0;
    // El delta se compone de las dos patas; `splitPatrimonyChange` mantiene la
    // identidad exacta si algún día el total viniera de otra fuente.
    const { aportadoCents, rendimientoCents } = splitPatrimonyChange(
      aportado + rendimiento,
      rendimiento,
    );
    result.set(key, {
      aportadoCents,
      rendimientoCents,
      deltaCents: aportadoCents + rendimientoCents,
    });
  }
  return result;
}
