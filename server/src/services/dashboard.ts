import { Types } from 'mongoose';
import { Category } from '../models/Category.js';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { Account } from '../models/Account.js';
import { Distribution } from '../models/Distribution.js';
import { Transfer } from '../models/Transfer.js';
import { IncomeConfig } from '../models/IncomeConfig.js';
import { assignedCents } from './money.js';
import { foldReparto, effectiveAssignedCents } from './reparto.js';
import { computeFundsForMonth, type FundView } from './funds.js';
import { madridMonthRange, madridParts, daysInMonth } from '../lib/time.js';

/**
 * Nómina vigente (céntimos). v1: una sola config por usuario, se usa su importe
 * para todos los meses (el histórico por `effectiveFrom`/snapshot es follow-up).
 */
export async function getNominaVigenteCents(userId: string): Promise<number> {
  const config = await IncomeConfig.findOne({ userId });
  return config?.amountCents ?? 0;
}

export interface DashboardCategory {
  id: string;
  name: string;
  kanji?: string;
  color: string;
  percentBp: number;
  /** ¿Es una categoría comodín (su dinero se reparte entre otras cada mes)? */
  flexible: boolean;
  /** ¿Es un sobre de ahorro (貯)? Su dinero se traspasa, no se gasta. */
  savings: boolean;
  /**
   * Asignado **efectivo** del mes: base (% de la nómina) + lo recibido de
   * comodines − lo repartido a otras. El reparto es una reasignación neutra:
   * no cambia el total del mes, solo cómo se distribuye entre categorías.
   */
  assignedCents: number;
  spentCents: number; // gasto normal del mes (excluye pagos de fondo)
  savedCents: number; // ahorrado este mes vía traspasos (solo sobres de ahorro)
  reservedCents: number; // reservado a fondos de esta categoría este mes
  receivedCents: number; // recibido este mes desde comodines
  distributedCents: number; // repartido este mes a otras (solo comodines)
}

export interface DashboardRitmo {
  diaActual: number;
  diasMes: number;
  gastadoCents: number;
  ritmoIdealCents: number;
}

export interface DashboardData {
  year: number;
  month: number;
  nominaCents: number;
  repartidoBp: number;
  sinAsignarBp: number;
  sinAsignarCents: number;
  categories: DashboardCategory[];
  funds: FundView[];
  gastadoTotalCents: number;
  reservadoTotalCents: number;
  ahorradoTotalCents: number;
  quedaPorGastarCents: number;
  ingresosMesCents: number;
  /** Ingresos "sueltos" del mes: todo lo que entró que NO es la nómina. */
  ingresosExtraCents: number;
  /** Gasto total del mes incluidos los pagos de fondo (para la caja real). */
  gastadoConFondosCents: number;
  /** Restante del mes (caja real): nómina + ingresos sueltos − gasto total. */
  restanteMesCents: number;
  ritmo: DashboardRitmo;
  patrimonioTotalCents: number;
}

/**
 * Resumen del panel para un mes (zona Europe/Madrid).
 *
 * Decisiones (documentadas en decisiones.md):
 * - **La nómina es la bolsa del mes:** `quedaPorGastarCents = nómina − gastado −
 *   ahorrado − reservado`. Cada mes parte de la nómina íntegra y de ella se descuenta
 *   lo que se GASTA, lo que se AHORRA a mano y lo que RESERVAN los fondos.
 * - **Ahorrar no es gastar, y es MANUAL (sobres de ahorro 貯):** el % del sobre de
 *   ahorro ya NO se pre-resta del presupuesto — es solo una **meta**. El dinero baja
 *   del "queda por gastar" únicamente cuando el usuario hace el traspaso
 *   (`Transfer.categoryId` a un sobre `savings` → `ahorradoTotalCents`). Ahorrar mueve
 *   dinero entre buckets: NO toca el patrimonio.
 * - **Reserva ≠ gasto (fondos 積立):** cada fondo reserva `provisionCents` de su
 *   categoría cada mes (apartado, no gastado, no toca el patrimonio). Su pago real
 *   (`Expense` con `fundId`) baja del saldo del fondo y del patrimonio al registrarlo.
 * - **Restante del mes (caja real):** `restanteMesCents = nómina + ingresosExtra −
 *   (gastado + pagos de fondo)`. `ingresosExtra` excluye la nómina registrada como
 *   ingreso (para no contarla dos veces). Ahorrar no resta aquí (sigue siendo tuyo).
 * - `gastadoTotalCents` / `spentCents` excluyen los pagos de fondo (`fundId`).
 * - `ritmoIdealCents = round((nómina − ahorrado − reservado) · diaActual/diasMes)`:
 *   se paga contra el presupuesto **libre**. `diaActual` = hoy si el mes es el actual,
 *   `diasMes` si es pasado, 0 si es futuro.
 */
export async function computeDashboard(
  userId: string,
  year: number,
  month: number,
): Promise<DashboardData> {
  const { start, end } = madridMonthRange(year, month);
  const uid = new Types.ObjectId(userId);
  const range = { $gte: start, $lt: end };

  // `fundId: null` casa tanto ausencia del campo como null → sólo gasto NORMAL
  // (los pagos de fondo se descuentan del saldo del fondo, no del mes).
  const normalRange = { userId: uid, date: range, fundId: null };

  const [
    categories,
    nominaCents,
    spentByCatAgg,
    gastadoAgg,
    ingresosAgg,
    accounts,
    fundsData,
    distributions,
    savedByCatAgg,
  ] = await Promise.all([
      Category.find({ userId }).sort({ order: 1, createdAt: 1 }).lean(),
      getNominaVigenteCents(userId),
      Expense.aggregate<{ _id: Types.ObjectId; spent: number }>([
        { $match: normalRange },
        { $group: { _id: '$categoryId', spent: { $sum: '$amountCents' } } },
      ]),
      Expense.aggregate<{ _id: null; total: number }>([
        { $match: normalRange },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]),
      Income.aggregate<{ _id: null; total: number; nomina: number }>([
        { $match: { userId: uid, date: range } },
        {
          $group: {
            _id: null,
            total: { $sum: '$amountCents' },
            nomina: { $sum: { $cond: ['$isNomina', '$amountCents', 0] } },
          },
        },
      ]),
      Account.find({ userId }).lean(),
      computeFundsForMonth(userId, year, month),
      Distribution.find({ userId, year, month }).lean(),
      // Ahorro del mes: traspasos que consumen el sobre de una categoría `savings`.
      Transfer.aggregate<{ _id: Types.ObjectId; saved: number }>([
        { $match: { userId: uid, date: range, categoryId: { $ne: null } } },
        { $group: { _id: '$categoryId', saved: { $sum: '$amountCents' } } },
      ]),
    ]);

  const spentByCat = new Map<string, number>();
  for (const row of spentByCatAgg) spentByCat.set(String(row._id), row.spent);

  const savedByCat = new Map<string, number>();
  for (const row of savedByCatAgg) savedByCat.set(String(row._id), row.saved);

  // Reparto de los comodines este mes: reasignación NEUTRA sobre el total del
  // mes (foldReparto solo cuenta tramos válidos, así lo recibido y lo repartido
  // cuadran). Ver services/reparto.ts.
  const liveCatIds = new Set(categories.map((c) => String(c._id)));
  const flexibleIds = new Set(categories.filter((c) => c.flexible).map((c) => String(c._id)));
  const { received: receivedByCat, distributed: distributedByCat } = foldReparto(
    distributions.map((d) => ({
      categoryId: String(d.categoryId),
      shares: d.shares.map((s) => ({
        toCategoryId: String(s.toCategoryId),
        amountCents: s.amountCents,
      })),
    })),
    liveCatIds,
    flexibleIds,
  );

  let repartidoBp = 0;
  let ahorradoTotalCents = 0;
  const cats: DashboardCategory[] = categories.map((c) => {
    const id = String(c._id);
    const baseAssigned = assignedCents(nominaCents, c.percentBp);
    repartidoBp += c.percentBp;
    const received = receivedByCat.get(id) ?? 0;
    const distributed = distributedByCat.get(id) ?? 0;
    const assigned = effectiveAssignedCents(baseAssigned, received, distributed);
    // El ahorro solo cuenta en un sobre de ahorro: un traspaso etiquetado a una
    // categoría que dejó de serlo no debe consumir presupuesto a escondidas.
    const saved = c.savings ? (savedByCat.get(id) ?? 0) : 0;
    if (c.savings) ahorradoTotalCents += saved;
    return {
      id,
      name: c.name,
      kanji: c.kanji,
      color: c.color,
      percentBp: c.percentBp,
      flexible: c.flexible,
      savings: c.savings,
      assignedCents: assigned,
      spentCents: spentByCat.get(id) ?? 0,
      savedCents: saved,
      reservedCents: fundsData.reservedByCategory.get(id) ?? 0,
      receivedCents: received,
      distributedCents: distributed,
    };
  });

  const gastadoTotalCents = gastadoAgg[0]?.total ?? 0;
  const reservadoTotalCents = fundsData.reservedTotalCents;
  const ingresosMesCents = ingresosAgg[0]?.total ?? 0;
  const nominaIncomeCents = ingresosAgg[0]?.nomina ?? 0;
  // Ingresos "sueltos": lo que entró este mes que NO es la nómina (evita contarla
  // dos veces si además se registra como ingreso real).
  const ingresosExtraCents = Math.max(0, ingresosMesCents - nominaIncomeCents);
  // Pagos reales de fondos este mes: salen del bolsillo aunque no sean gasto normal.
  const pagosFondosCents = fundsData.funds.reduce((sum, f) => sum + f.paidThisMonthCents, 0);
  const gastadoConFondosCents = gastadoTotalCents + pagosFondosCents;
  const sinAsignarBp = 10000 - repartidoBp;
  const sinAsignarCents = assignedCents(nominaCents, sinAsignarBp);

  // "Queda por gastar" (presupuesto del mes): la nómina es la bolsa, y de ella se
  // descuenta lo GASTADO, lo AHORRADO a mano (traspasos a sobres de ahorro) y lo
  // RESERVADO a fondos. El % de ahorro ya NO se pre-resta: solo baja al traspasar.
  const quedaPorGastarCents =
    nominaCents - gastadoTotalCents - ahorradoTotalCents - reservadoTotalCents;

  // "Restante del mes" (caja real): todo lo que entra (nómina + ingresos sueltos)
  // menos todo lo que sale (gasto normal + pagos de fondo). Ahorrar no resta aquí:
  // sigue siendo tu dinero, solo cambia de bucket (tampoco toca el patrimonio).
  const restanteMesCents = nominaCents + ingresosExtraCents - gastadoConFondosCents;

  // Ritmo del mes (zona Europe/Madrid).
  const diasMes = daysInMonth(year, month);
  const now = madridParts(new Date());
  let diaActual: number;
  if (now.year === year && now.month === month) {
    diaActual = now.day;
  } else if (year < now.year || (year === now.year && month < now.month)) {
    diaActual = diasMes; // mes pasado → completo
  } else {
    diaActual = 0; // mes futuro
  }
  // El ritmo se mide contra el presupuesto LIBRE del mes: la nómina menos lo ya
  // apartado (ahorro a mano + reserva de fondos). Así `gastable − gastado = queda`.
  const gastableCents = Math.max(0, nominaCents - ahorradoTotalCents - reservadoTotalCents);
  const ritmoIdealCents = Math.round((gastableCents * diaActual) / diasMes);

  const patrimonioTotalCents = accounts.reduce(
    (sum, account) =>
      sum + account.buckets.reduce((acc, bucket) => acc + bucket.balanceCents, 0),
    0,
  );

  return {
    year,
    month,
    nominaCents,
    repartidoBp,
    sinAsignarBp,
    sinAsignarCents,
    categories: cats,
    funds: fundsData.funds,
    gastadoTotalCents,
    reservadoTotalCents,
    ahorradoTotalCents,
    quedaPorGastarCents,
    ingresosMesCents,
    ingresosExtraCents,
    gastadoConFondosCents,
    restanteMesCents,
    ritmo: { diaActual, diasMes, gastadoCents: gastadoTotalCents, ritmoIdealCents },
    patrimonioTotalCents,
  };
}
