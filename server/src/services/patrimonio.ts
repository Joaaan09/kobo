import { Types } from 'mongoose';
import { Account } from '../models/Account.js';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { Valuation } from '../models/Valuation.js';
import { splitPatrimonyChange } from './rendimiento.js';
import { TZ, cycleKeyOfDayKey, type CycleConfig } from '../lib/time.js';

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

/**
 * Agrupación por **día** 'YYYY-MM-DD' en zona Europe/Madrid. Se pliega a la clave
 * de ciclo en JS (`cycleKeyOfDayKey`): Mongo no sabe del inicio de mes del usuario.
 */
const dayKey = { $dateToString: { date: '$date', format: '%Y-%m-%d', timezone: TZ } };

/** Suma por clave de ciclo filas `{ _id: día, total }`. */
function foldByCycle(
  rows: { _id: string; total: number }[],
  cycle: CycleConfig,
  sign: 1 | -1,
  into: Map<string, number>,
): void {
  for (const row of rows) {
    const key = cycleKeyOfDayKey(cycle, row._id);
    into.set(key, (into.get(key) ?? 0) + sign * row.total);
  }
}

/** Ids de los sub-saldos que existen hoy (los de cuentas o buckets borrados ya no cuentan). */
async function liveBucketIds(userId: string): Promise<Types.ObjectId[]> {
  const accounts = await Account.find({ userId }, { 'buckets._id': 1 }).lean();
  return accounts.flatMap((a) => a.buckets.map((b) => b._id as Types.ObjectId));
}

/**
 * Variación del patrimonio mes a mes (mes = ciclo del usuario), indexada por 'YYYY-MM'.
 *
 * Qué cuenta y qué no (el dinero es sagrado):
 * - **Aportado** = ingresos − gastos que **tocan un sub-saldo vivo**. Un gasto
 *   histórico sin cuenta (`affectsPatrimony: false`) no movió saldo, así que
 *   tampoco mueve esta cifra; el de una cuenta ya borrada tampoco, porque ese
 *   saldo ya no forma parte del patrimonio de hoy (si contara, el patrimonio
 *   reconstruido hacia atrás arrastraría dinero de una cuenta que no existe).
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
  cycle: CycleConfig,
): Promise<Map<string, PatrimonyChange>> {
  const uid = new Types.ObjectId(userId);
  const buckets = await liveBucketIds(userId);
  // Solo lo que movió un saldo que sigue existiendo.
  const linked = { userId: uid, bucketId: { $in: buckets } };

  const [outAgg, inAgg, yieldAgg] = await Promise.all([
    Expense.aggregate<{ _id: string; total: number }>([
      { $match: linked },
      { $group: { _id: dayKey, total: { $sum: '$amountCents' } } },
    ]),
    Income.aggregate<{ _id: string; total: number }>([
      { $match: linked },
      { $group: { _id: dayKey, total: { $sum: '$amountCents' } } },
    ]),
    Valuation.aggregate<{ _id: string; total: number }>([
      { $match: linked },
      { $group: { _id: dayKey, total: { $sum: '$deltaCents' } } },
    ]),
  ]);

  const flows = new Map<string, number>(); // ingresos − gastos, por ciclo
  foldByCycle(inAgg, cycle, 1, flows);
  foldByCycle(outAgg, cycle, -1, flows);

  const yields = new Map<string, number>();
  foldByCycle(yieldAgg, cycle, 1, yields);

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

/**
 * Patrimonio al **cierre** de cada mes, reconstruido hacia atrás desde el total
 * de hoy: `cierre(M) = total_hoy − Σ delta(K)` para todo `K > M`. Así
 * `cierre(M) − cierre(M−1) = delta(M)` exacto: "cuánto más tengo que el mes
 * pasado" y la variación del mes son la misma cifra, nunca dos que descuadren.
 *
 * Para el mes en curso el "cierre" es el saldo de hoy (más lo fechado a futuro,
 * si lo hubiera, que ya movió los saldos).
 *
 * Límite conocido: los ajustes manuales de saldo no son eventos fechados, así que
 * se proyectan sobre todo el pasado (ver decisiones.md).
 */
export function patrimonyAtCloseByMonth(
  totalNowCents: number,
  changes: Map<string, PatrimonyChange>,
  keys: string[],
): Map<string, number> {
  const allKeys = [...new Set([...keys, ...changes.keys()])].sort(); // 'YYYY-MM' ordena bien
  const result = new Map<string, number>();
  // Recorremos de la más reciente a la más antigua deshaciendo los deltas posteriores.
  let running = totalNowCents;
  for (let i = allKeys.length - 1; i >= 0; i--) {
    const key = allKeys[i];
    result.set(key, running);
    running -= changes.get(key)?.deltaCents ?? 0;
  }
  return result;
}
