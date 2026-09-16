import { MAX_AMOUNT_CENTS, readStoredMoneyCents, centsToNumber } from "../money";
import {
  buildJobFinancialView,
  formatMoney,
  type JobFinancialView,
  type RawJobRow,
  type RawTransactionRow,
} from "./jobView";
import type { AgentFacts, Candidate } from "./types";

/**
 * ANÁLISIS DETERMINISTA del negocio. Todo lo que sea un número sale de acá:
 * saldos, antigüedad de deuda, márgenes, caja. Son funciones puras sobre filas
 * ya leídas de la base, sin LLM y sin I/O, para poder testearlas enteras.
 *
 * El modelo recibe esta salida como HECHOS y sólo puede priorizar y redactar
 * sobre ella.
 */

export type RawProductRow = {
  id: number;
  name?: string | null;
  costPrice?: string | number | null;
  stock?: number | null;
  minStock?: number | null;
};

export type RawCustomerRow = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type BusinessSnapshot = {
  today: string;
  jobs: RawJobRow[];
  transactions: RawTransactionRow[];
  customers: RawCustomerRow[];
  products: RawProductRow[];
};

// ===== Utilidades de fecha (YYYY-MM-DD, sin dependencias ni zonas horarias) =====

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Convierte YYYY-MM-DD a días desde epoch en UTC. null si la fecha no es válida. */
export function toEpochDay(date: string): number | null {
  const m = DATE_RE.exec((date ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  // Rechaza fechas imposibles que Date "corrige" sola (ej. 2024-02-31).
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return Math.floor(ms / 86_400_000);
}

/** Días transcurridos entre dos fechas YYYY-MM-DD. null si alguna es inválida. */
export function daysBetween(from: string, to: string): number | null {
  const a = toEpochDay(from);
  const b = toEpochDay(to);
  if (a === null || b === null) return null;
  return b - a;
}

/**
 * Fecha de hoy en la zona horaria de la empresa (Argentina), en YYYY-MM-DD. La
 * aritmética de antigüedad de deuda se hace contra ESTA fecha y no contra UTC:
 * con UTC, a la noche argentina el sistema ya estaría contando el día siguiente.
 */
export function todayInBusinessTimezone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type AgingBucket = "0-15" | "16-30" | "31-60" | "61-90" | "90+";

export function agingBucket(days: number): AgingBucket {
  if (days <= 15) return "0-15";
  if (days <= 30) return "16-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** Mes YYYY-MM de una fecha YYYY-MM-DD, o "" si no es válida. */
export function monthOf(date: string): string {
  const m = DATE_RE.exec((date ?? "").trim());
  return m ? `${m[1]}-${m[2]}` : "";
}

/** Corre `months` meses hacia atrás desde un YYYY-MM. */
export function shiftMonth(month: string, months: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec((month ?? "").trim());
  if (!m) return "";
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) - months;
  const year = Math.floor(total / 12);
  const monthIndex = total - year * 12;
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}`;
}

// ===== AGENTE DE COBRANZAS =====

/** Estados en los que el trabajo ya se hizo: recién ahí hay algo para cobrar. */
const COLLECTABLE_STATUSES = new Set(["completed", "invoiced", "collected"]);

export type ReceivableRow = {
  view: JobFinancialView;
  daysOutstanding: number | null;
  bucket: AgingBucket | null;
  /** Trabajo terminado del que todavía no se emitió factura. */
  pendingInvoice: boolean;
  lastPaymentDate: string | null;
};

/** Última fecha de cobro marcado de un trabajo, o null si nunca cobró. */
export function lastPaymentDateFor(
  transactions: RawTransactionRow[],
  jobId: number,
): string | null {
  let latest: string | null = null;
  let latestDay = -Infinity;
  for (const t of transactions) {
    if (t.relatedJobId !== jobId || t.isJobPayment !== true) continue;
    const date = typeof t.date === "string" ? t.date : "";
    const day = toEpochDay(date);
    if (day === null) continue;
    if (day > latestDay) {
      latestDay = day;
      latest = date;
    }
  }
  return latest;
}

/**
 * Cuentas por cobrar: trabajos ya ejecutados con saldo positivo. Los trabajos
 * con datos financieros ilegibles quedan fuera y se reportan como warning: es
 * preferible no opinar a opinar sobre un número que no se pudo verificar.
 */
export function computeReceivables(snapshot: BusinessSnapshot): {
  rows: ReceivableRow[];
  warnings: string[];
} {
  const rows: ReceivableRow[] = [];
  const warnings: string[] = [];

  for (const job of snapshot.jobs) {
    const view = buildJobFinancialView(job, snapshot.transactions);
    if (!COLLECTABLE_STATUSES.has(view.status)) continue;

    if (view.dataIssue) {
      warnings.push(
        `Trabajo ${view.jobNumber || view.id} excluido del análisis de cobranzas: ${view.dataIssue}.`,
      );
      continue;
    }
    if (view.balanceCents <= 0) continue;

    const daysOutstanding = view.referenceDate
      ? daysBetween(view.referenceDate, snapshot.today)
      : null;

    rows.push({
      view,
      daysOutstanding,
      bucket: daysOutstanding === null ? null : agingBucket(Math.max(0, daysOutstanding)),
      pendingInvoice: view.status === "completed" && !view.invoiceNumber,
      lastPaymentDate: lastPaymentDateFor(snapshot.transactions, view.id),
    });
  }

  // Más viejo y más grande primero: es el orden en que duele la plata parada.
  rows.sort((a, b) => {
    const days = (b.daysOutstanding ?? 0) - (a.daysOutstanding ?? 0);
    if (days !== 0) return days;
    return b.view.balanceCents - a.view.balanceCents;
  });

  return { rows, warnings };
}

/** Cuántas filas de evidencia se le pasan al modelo como máximo. */
const MAX_CANDIDATES = 25;

export function buildCollectionsFacts(snapshot: BusinessSnapshot): AgentFacts {
  const { rows, warnings } = computeReceivables(snapshot);

  const byCurrency: Record<string, { totalCents: number; count: number }> = {};
  const byBucket: Record<string, { totalCents: number; count: number }> = {};
  const byCustomer = new Map<string, { name: string; totalCents: number; count: number; currency: string }>();

  for (const row of rows) {
    const currency = row.view.currency;
    byCurrency[currency] = byCurrency[currency] ?? { totalCents: 0, count: 0 };
    byCurrency[currency].totalCents += row.view.balanceCents;
    byCurrency[currency].count += 1;

    const bucket = row.bucket ?? "sin fecha";
    byBucket[bucket] = byBucket[bucket] ?? { totalCents: 0, count: 0 };
    byBucket[bucket].totalCents += row.view.balanceCents;
    byBucket[bucket].count += 1;

    const key = `${row.view.customerId ?? "s/c"}|${currency}`;
    const current = byCustomer.get(key) ?? {
      name: row.view.customerName || "(sin cliente)",
      totalCents: 0,
      count: 0,
      currency,
    };
    current.totalCents += row.view.balanceCents;
    current.count += 1;
    byCustomer.set(key, current);
  }

  const topDebtors = Array.from(byCustomer.values())
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 5)
    .map((c) => ({
      cliente: c.name,
      saldo: formatMoney(c.totalCents, c.currency === "USD" ? "USD" : "ARS"),
      trabajosImpagos: c.count,
    }));

  const candidates: Candidate[] = rows.slice(0, MAX_CANDIDATES).map((row) => ({
    ref: `job:${row.view.id}`,
    entityType: "job" as const,
    entityId: row.view.id,
    label: `${row.view.jobNumber || `#${row.view.id}`} — ${row.view.title || "(sin título)"}`,
    evidence: {
      trabajo: row.view.jobNumber || `#${row.view.id}`,
      titulo: row.view.title,
      cliente: row.view.customerName || "(sin cliente)",
      telefono: row.view.customerPhone || "",
      estado: row.view.status,
      moneda: row.view.currency,
      total: formatMoney(row.view.totalCents, row.view.currency),
      cobrado: formatMoney(row.view.paidCents, row.view.currency),
      saldo: formatMoney(row.view.balanceCents, row.view.currency),
      saldoNumerico: centsToNumber(row.view.balanceCents),
      diasDesdeFacturaOCierre: row.daysOutstanding,
      antiguedad: row.bucket ?? "sin fecha de referencia",
      factura: row.view.invoiceNumber || "(sin factura emitida)",
      faltaFacturar: row.pendingInvoice,
      ultimoCobro: row.lastPaymentDate ?? "nunca cobró",
      vencimientoComprometido: row.view.dueDate || "(sin fecha comprometida)",
    },
  }));

  return {
    agentKey: "collections",
    today: snapshot.today,
    summary: {
      trabajosConSaldo: rows.length,
      totalPorCobrar: Object.entries(byCurrency).map(([currency, v]) => ({
        moneda: currency,
        total: formatMoney(v.totalCents, currency === "USD" ? "USD" : "ARS"),
        trabajos: v.count,
      })),
      porAntiguedad: Object.entries(byBucket).map(([bucket, v]) => ({
        tramoDias: bucket,
        trabajos: v.count,
      })),
      principalesDeudores: topDebtors,
      trabajosTerminadosSinFacturar: rows.filter((r) => r.pendingInvoice).length,
      candidatosMostrados: candidates.length,
    },
    candidates,
    warnings,
  };
}

// ===== AGENTE DE FINANZAS / RENTABILIDAD =====

export type JobMargin = {
  view: JobFinancialView;
  productsCostCents: number;
  expensesCents: number;
  marginCents: number;
  /** Porcentaje sobre el subtotal, o null si no es computable/comparable. */
  marginPct: number | null;
  /** Trabajo en USD con gastos imputados en ARS: márgenes no comparables. */
  mixedCurrencies: boolean;
};

/**
 * Margen de un trabajo:
 *   margen = subtotal sin IVA − costo de productos usados − gastos imputados
 *
 * Los gastos imputados son las transactions de tipo `expense` con
 * `relatedJobId`, tomadas por su importe neto. Los ingresos con `relatedJobId`
 * NO se suman: son cobros del propio trabajo, no ganancia adicional.
 */
export function computeJobMargin(
  view: JobFinancialView,
  products: RawProductRow[],
  transactions: RawTransactionRow[],
): JobMargin | null {
  if (view.dataIssue) return null;

  const costById = new Map<string, number>();
  for (const p of products) {
    const cents = readStoredMoneyCents(p.costPrice);
    if (cents !== null) costById.set(String(p.id), cents);
  }

  let productsCostCents = 0;
  for (const used of view.productsUsed) {
    const unitCost = costById.get(String(used.productId));
    // Producto borrado o sin costo cargado: se estima con el 70% del precio de
    // venta, el mismo criterio conservador que ya usa el panel de márgenes.
    const fallbackCents = Math.round(used.unitPrice * 100 * 0.7);
    const perUnit = unitCost ?? fallbackCents;
    productsCostCents += Math.round(perUnit * used.quantity);
    if (!Number.isSafeInteger(productsCostCents) || productsCostCents > MAX_AMOUNT_CENTS) {
      return null;
    }
  }

  let expensesCents = 0;
  for (const t of transactions) {
    if (t.relatedJobId !== view.id || t.type !== "expense") continue;
    const cents = readStoredMoneyCents(t.amount);
    if (cents === null) return null;
    expensesCents += cents;
    if (!Number.isSafeInteger(expensesCents) || expensesCents > MAX_AMOUNT_CENTS) return null;
  }

  // Los gastos del sistema se cargan siempre en ARS. Si el trabajo se facturó en
  // USD, restarlos del subtotal sería sumar peras con manzanas: se informan
  // aparte y no se calcula porcentaje.
  const mixedCurrencies = view.currency === "USD" && expensesCents > 0;
  const marginCents = mixedCurrencies
    ? view.subtotalCents - productsCostCents
    : view.subtotalCents - productsCostCents - expensesCents;

  const marginPct =
    !mixedCurrencies && view.subtotalCents > 0
      ? (marginCents / view.subtotalCents) * 100
      : null;

  return { view, productsCostCents, expensesCents, marginCents, marginPct, mixedCurrencies };
}

/** Umbral por debajo del cual un margen se considera flaco para el rubro. */
export const THIN_MARGIN_PCT = 15;

export type MonthlyFlow = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
};

/** Ingresos vs egresos por mes (todas las transactions, en ARS). */
export function computeMonthlyFlow(
  transactions: RawTransactionRow[],
  months: string[],
): MonthlyFlow[] {
  const byMonth = new Map<string, MonthlyFlow>();
  for (const month of months) {
    byMonth.set(month, { month, incomeCents: 0, expenseCents: 0, netCents: 0 });
  }
  for (const t of transactions) {
    const month = monthOf(typeof t.date === "string" ? t.date : "");
    const entry = byMonth.get(month);
    if (!entry) continue;
    const cents = readStoredMoneyCents(t.amount);
    if (cents === null) continue;
    if (t.type === "income") entry.incomeCents += cents;
    else if (t.type === "expense") entry.expenseCents += cents;
  }
  for (const entry of Array.from(byMonth.values())) {
    entry.netCents = entry.incomeCents - entry.expenseCents;
  }
  return months.map((m) => byMonth.get(m)!);
}

/** Estados de trabajos que ya tienen precio cerrado y sirven para medir margen. */
const MARGIN_STATUSES = new Set(["completed", "invoiced", "collected"]);

export function buildFinanceFacts(snapshot: BusinessSnapshot): AgentFacts {
  const warnings: string[] = [];
  const margins: JobMargin[] = [];

  for (const job of snapshot.jobs) {
    const view = buildJobFinancialView(job, snapshot.transactions);
    if (!MARGIN_STATUSES.has(view.status)) continue;
    if (view.dataIssue) {
      warnings.push(
        `Trabajo ${view.jobNumber || view.id} excluido del análisis de rentabilidad: ${view.dataIssue}.`,
      );
      continue;
    }
    const margin = computeJobMargin(view, snapshot.products, snapshot.transactions);
    if (!margin) {
      warnings.push(
        `Trabajo ${view.jobNumber || view.id} excluido: costos o gastos imputados ilegibles.`,
      );
      continue;
    }
    margins.push(margin);
  }

  const currentMonth = monthOf(snapshot.today);
  const months = currentMonth
    ? [shiftMonth(currentMonth, 2), shiftMonth(currentMonth, 1), currentMonth]
    : [];
  const flow = computeMonthlyFlow(snapshot.transactions, months);

  // Lo que merece una decisión: márgenes negativos o flacos primero.
  const problematic = margins
    .filter((m) => m.marginPct === null || m.marginPct < THIN_MARGIN_PCT)
    .sort((a, b) => {
      const pctA = a.marginPct ?? 0;
      const pctB = b.marginPct ?? 0;
      if (pctA !== pctB) return pctA - pctB;
      return a.marginCents - b.marginCents;
    });

  const withPct = margins.filter((m) => m.marginPct !== null);
  const avgMarginPct =
    withPct.length > 0
      ? withPct.reduce((sum, m) => sum + (m.marginPct ?? 0), 0) / withPct.length
      : null;

  const candidates: Candidate[] = problematic.slice(0, MAX_CANDIDATES).map((m) => ({
    ref: `job:${m.view.id}`,
    entityType: "job" as const,
    entityId: m.view.id,
    label: `${m.view.jobNumber || `#${m.view.id}`} — ${m.view.title || "(sin título)"}`,
    evidence: {
      trabajo: m.view.jobNumber || `#${m.view.id}`,
      titulo: m.view.title,
      cliente: m.view.customerName || "(sin cliente)",
      estado: m.view.status,
      moneda: m.view.currency,
      subtotalSinIva: formatMoney(m.view.subtotalCents, m.view.currency),
      costoProductos: formatMoney(m.productsCostCents, m.view.currency),
      gastosImputados: formatMoney(m.expensesCents, "ARS"),
      margen: formatMoney(m.marginCents, m.view.currency),
      margenNumerico: centsToNumber(m.marginCents),
      margenPorcentaje: m.marginPct === null ? null : Number(m.marginPct.toFixed(1)),
      divisasMixtas: m.mixedCurrencies,
      saldoPendiente: formatMoney(m.view.balanceCents, m.view.currency),
      fecha: m.view.referenceDate || "(sin fecha)",
    },
  }));

  return {
    agentKey: "finance",
    today: snapshot.today,
    summary: {
      trabajosAnalizados: margins.length,
      margenPromedioPorcentaje: avgMarginPct === null ? null : Number(avgMarginPct.toFixed(1)),
      trabajosConMargenNegativo: margins.filter((m) => m.marginCents < 0).length,
      trabajosConMargenFlaco: margins.filter(
        (m) => m.marginPct !== null && m.marginPct >= 0 && m.marginPct < THIN_MARGIN_PCT,
      ).length,
      umbralMargenFlacoPorcentaje: THIN_MARGIN_PCT,
      flujoMensual: flow.map((f) => ({
        mes: f.month,
        ingresos: formatMoney(f.incomeCents, "ARS"),
        egresos: formatMoney(f.expenseCents, "ARS"),
        neto: formatMoney(f.netCents, "ARS"),
      })),
      candidatosMostrados: candidates.length,
    },
    candidates,
    warnings,
  };
}
