/**
 * Tipos del dominio, reflejo del contrato de API (ver .progreso/decisiones.md).
 * Regla dura: **todo importe en céntimos** (enteros) y **todo % en basis points** (100 bp = 1 %).
 */

export type ThemePref = 'washi' | 'sumi' | 'auto';

export interface UserPrefs {
  theme: ThemePref;
  mincho: boolean;
  modules: Record<string, boolean>;
}

export interface User {
  id: string;
  email: string;
  prefs: UserPrefs;
}

export interface IncomeConfig {
  id: string;
  type: 'fija' | 'variable';
  amountCents: number;
  payDay: number;
  effectiveFrom: string;
  /** Cuenta + sub-saldo donde cae la nómina (opcional). */
  defaultAccountId?: string;
  defaultBucketId?: string;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  limitCents?: number;
}

export interface Category {
  id: string;
  name: string;
  kanji?: string;
  color: string;
  percentBp: number;
  order: number;
  flexible: boolean;
  /** Sobre de ahorro (貯): su dinero se traspasa, no se gasta. */
  savings: boolean;
  subcategories?: Subcategory[];
}

/**
 * Fondo de previsión (積立): gasto no mensual que se suaviza. Reserva
 * `targetCents / everyMonths` cada mes de su categoría y acumula (rollover).
 * `subcategoryId` es solo etiqueta: el dinero sale del sobre de la categoría.
 */
export interface Fund {
  id: string;
  categoryId: string;
  subcategoryId?: string;
  name: string;
  kanji?: string;
  targetCents: number;
  everyMonths: number;
  startYear: number;
  startMonth: number;
  order: number;
}

/** Fondo tal y como lo devuelve el panel (con saldo/reserva ya calculados del mes). */
export interface FundView {
  id: string;
  categoryId: string;
  subcategoryId?: string;
  name: string;
  kanji?: string;
  targetCents: number;
  everyMonths: number;
  provisionCents: number;
  reservedCents: number;
  balanceCents: number;
  paidThisMonthCents: number;
  active: boolean;
  monthsUntilTarget: number | null;
}

export interface Expense {
  id: string;
  amountCents: number;
  date: string;
  categoryId: string;
  subcategoryId?: string;
  fundId?: string;
  accountId?: string;
  bucketId?: string;
  /** Si es `false`, el gasto NO mueve el patrimonio (registro histórico/informativo). */
  affectsPatrimony?: boolean;
  note?: string;
  /** `ingest` = lo creó la automatización del móvil, no la app. */
  source?: 'manual' | 'ingest';
  /** Comercio que informó Wallet (solo en gastos ingeridos). */
  merchant?: string;
  /** Entró por automatización sin regla que lo clasificara: falta confirmar categoría. */
  needsReview?: boolean;
}

/**
 * Token de ingesta (自動): credencial del Atajo de iOS. El valor en claro solo
 * se ve UNA vez, al crearlo; después solo queda el `prefix` para reconocerlo.
 */
export interface ApiToken {
  id: string;
  label: string;
  prefix: string;
  /** Cuenta + sub-saldo de la tarjeta detrás del token (descuenta patrimonio). */
  accountId?: string;
  bucketId?: string;
  lastUsedAt?: string;
  /** Último pago rechazado y por qué: la ingesta ya no falla en silencio. */
  lastFailureAt?: string;
  lastFailureReason?: string;
  revokedAt?: string;
  createdAt?: string;
}

/** Regla de auto-asignación: "si el comercio contiene X → esta categoría". */
export interface IngestRule {
  id: string;
  /** Texto tal cual lo escribió el usuario. */
  label: string;
  /** Su forma normalizada (lo que se compara de verdad). */
  match: string;
  categoryId: string;
  subcategoryId?: string;
  hits: number;
  lastUsedAt?: string;
}

export interface Income {
  id: string;
  amountCents: number;
  date: string;
  source?: string;
  accountId?: string;
  bucketId?: string;
  isNomina: boolean;
}

/**
 * Movimiento (transferencia) entre dos sub-saldos del patrimonio. Neutro: mueve
 * dinero de un bucket a otro sin ser gasto ni ingreso (no toca el presupuesto).
 */
export interface Transfer {
  id: string;
  amountCents: number;
  date: string;
  fromAccountId: string;
  fromBucketId: string;
  toAccountId: string;
  toBucketId: string;
  /** Sobre de ahorro que consume este movimiento (categoría con `savings`). */
  categoryId?: string;
  note?: string;
}

/**
 * Naturaleza de un sub-saldo: efectivo, remunerado (liquida intereses) o
 * invertido (su valor fluctúa). Ver `models/Account.ts` en el server.
 */
export type BucketKind = 'cash' | 'savings' | 'investment';

/** Sub-saldo dentro de una cuenta (p. ej. "Sueldo base" / "Inversión"). */
export interface Bucket {
  _id: string;
  name: string;
  balanceCents: number;
  kind: BucketKind;
  /** Solo remunerados: tipo NOMINAL anual en puntos básicos (3 % → 300). */
  rateBps?: number;
  /** Solo remunerados: retención sobre intereses en bps (19 % → 1900). */
  withholdingBps?: number;
}

/** Tipo de rendimiento: intereses liquidados o cambio de valor de mercado. */
export type ValuationKind = 'interes' | 'revalorizacion';

/**
 * Valoración (評価): variación de valor de un sub-saldo que no viene de un
 * movimiento del usuario. Mueve patrimonio; **no** es gasto ni ingreso.
 */
export interface Valuation {
  id: string;
  accountId: string;
  bucketId: string;
  date: string;
  /** Firmado: una inversión también cae. */
  deltaCents: number;
  kind: ValuationKind;
  /** Solo intereses: bruto antes de retención. */
  grossCents?: number;
  note?: string;
}

export interface NewValuation {
  accountId: string;
  bucketId: string;
  date: string;
  kind: ValuationKind;
  /** Importe del rendimiento (intereses). Excluyente con `targetCents`. */
  deltaCents?: number;
  /** Valor total actual del sub-saldo; el servidor calcula el delta real. */
  targetCents?: number;
  grossCents?: number;
  note?: string;
}

/** Estimación de la liquidación pendiente de un sub-saldo remunerado. */
export interface InterestEstimate {
  since: string;
  days: number;
  balanceCents: number;
  rateBps: number;
  withholdingBps: number;
  grossCents: number;
  withheldCents: number;
  netCents: number;
}

/** Contexto que el servidor calcula para la hoja de valoración. */
export interface ValuationContext {
  accountId: string;
  bucketId: string;
  kind: BucketKind;
  balanceCents: number;
  rateBps: number | null;
  withholdingBps: number | null;
  since: string;
  lastValuationAt: string | null;
  /** Aportado por traspaso desde la última valoración (neto, puede ser negativo). */
  contributedSinceCents: number;
  estimate: InterestEstimate | null;
}

export interface Account {
  id: string;
  name: string;
  color?: string;
  order: number;
  buckets: Bucket[];
}

/** Categoría tal y como la devuelve el panel (con importes ya calculados). */
export interface DashboardCategory {
  id: string;
  name: string;
  kanji?: string;
  color: string;
  percentBp: number;
  /** ¿Es una categoría comodín (su dinero se reparte entre otras cada mes)? */
  flexible: boolean;
  /** ¿Es un sobre de ahorro? No cuenta como gasto ni entra en el ritmo del mes. */
  savings: boolean;
  /** Asignado efectivo del mes: base + recibido de comodines − repartido. */
  assignedCents: number;
  spentCents: number;
  /** Movido este mes a este sobre de ahorro (0 en categorías normales). */
  savedCents: number;
  reservedCents: number;
  /** Recibido este mes desde comodines. */
  receivedCents: number;
  /** Repartido este mes a otras categorías (solo comodines). */
  distributedCents: number;
}

export interface DashboardRitmo {
  diaActual: number;
  diasMes: number;
  gastadoCents: number;
  ritmoIdealCents: number;
}

export interface DashboardSummary {
  nominaCents: number;
  repartidoBp: number;
  sinAsignarBp: number;
  sinAsignarCents: number;
  categories: DashboardCategory[];
  funds: FundView[];
  gastadoTotalCents: number;
  reservadoTotalCents: number;
  /** Movido este mes a sobres de ahorro (no es gasto). */
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

export interface MonthSummary {
  year: number;
  month: number;
  nominaCents: number;
  gastadoCents: number;
  ingresosCents: number;
  usadoBp: number;
  /** Variación del patrimonio del mes, descompuesta (delta = aportado + rendimiento). */
  aportadoCents: number;
  rendimientoCents: number;
  patrimonioDeltaCents: number;
}

/** Liquidación de intereses estimada y aún sin registrar, por sub-saldo. */
export interface PendingYield {
  accountId: string;
  bucketId: string;
  days: number;
  netCents: number;
}

/** Cuerpos de creación (POST /expenses | /incomes). */
export interface NewExpense {
  amountCents: number;
  date: string;
  categoryId: string;
  subcategoryId?: string;
  fundId?: string;
  accountId?: string;
  bucketId?: string;
  /** Omitido = afecta al patrimonio (por defecto). Envía `false` para un registro histórico. */
  affectsPatrimony?: boolean;
  note?: string;
}

/** Cuerpo de creación/edición de un fondo (POST/PATCH /funds). */
export interface NewFund {
  categoryId: string;
  subcategoryId?: string;
  name: string;
  kanji?: string;
  targetCents: number;
  everyMonths: number;
  startYear?: number;
  startMonth?: number;
}

export interface NewIncome {
  amountCents: number;
  date: string;
  source?: string;
  accountId?: string;
  bucketId?: string;
  isNomina?: boolean;
}

/** Cuerpo de creación de un movimiento (POST /transfers). */
export interface NewTransfer {
  amountCents: number;
  date: string;
  fromAccountId: string;
  fromBucketId: string;
  toAccountId: string;
  toBucketId: string;
  /** Sobre de ahorro que consume este movimiento (opcional). */
  categoryId?: string;
  note?: string;
}

/** Un tramo del reparto de un comodín: cuánto va a una categoría (y subcategoría). */
export interface DistributionShare {
  toCategoryId: string;
  toSubcategoryId?: string;
  amountCents: number;
}

/** Reparto mensual de una categoría comodín entre otras (por mes). */
export interface Distribution {
  id: string;
  categoryId: string;
  year: number;
  month: number;
  shares: DistributionShare[];
}

/** Cuerpo del PUT /distributions (fija el reparto de un comodín en un mes). */
export interface NewDistribution {
  categoryId: string;
  /** Mes en formato `YYYY-MM`. */
  month: string;
  shares: DistributionShare[];
}
