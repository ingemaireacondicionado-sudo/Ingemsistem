import {
  MAX_AMOUNT_CENTS,
  readStoredMoneyCents,
  readStoredRate,
  centsToNumber,
} from "../money";

/**
 * Normalización SERVER-SIDE de un trabajo a su vista financiera, en CENTAVOS
 * enteros. Es la única fuente de números que consumen los agentes.
 *
 * Refleja la misma fórmula que ya usa la app (subtotal = mano de obra +
 * materiales + otros; total = subtotal + IVA) y el saldo CANÓNICO del ledger:
 *
 *     cobrado = legacyPaidBase + Σ(transactions con isJobPayment = true)
 *
 * con el mismo criterio de transición: si `legacyPaidBase` es NULL el trabajo
 * todavía no hizo cutover y el cobrado histórico vive en el cache `amountPaid`
 * del blob `notes`.
 *
 * FAIL-SOFT, no fail-closed: acá no se cobra ni se escribe nada, así que un dato
 * ilegible no aborta el análisis; marca el trabajo con `dataIssue` y el agente
 * lo deja fuera de toda conclusión monetaria en vez de inventar un número.
 */

export type JobCurrency = "ARS" | "USD";

export type JobFinancialView = {
  id: number;
  jobNumber: string;
  title: string;
  /** Estado tal cual está en la base: pending | in-progress | completed | invoiced | collected */
  status: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  currency: JobCurrency;
  subtotalCents: number;
  ivaRate: number | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  /** Fecha más representativa del inicio del crédito comercial (YYYY-MM-DD). */
  referenceDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  startDate: string;
  endDate: string;
  budgetStatus: string;
  productsUsed: Array<{ productId: string; quantity: number; unitPrice: number }>;
  /** Motivo por el que los importes NO son confiables, o null si están sanos. */
  dataIssue: string | null;
};

export type RawJobRow = {
  id: number;
  jobNumber?: string | null;
  title?: string | null;
  status?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  invoiceNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  legacyPaidBase?: string | number | null;
};

export type RawTransactionRow = {
  id: number;
  type?: string | null;
  amount?: string | number | null;
  date?: string | null;
  category?: string | null;
  description?: string | null;
  relatedJobId?: number | null;
  isJobPayment?: boolean | null;
};

/** Parseo defensivo del blob `notes` de un job. Nunca lanza. */
export function parseJobMeta(notes: string | null | undefined): Record<string, unknown> {
  if (!notes || typeof notes !== "string" || !notes.trim().startsWith("{")) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readCurrency(value: unknown): JobCurrency {
  return value === "USD" ? "USD" : "ARS";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readProductsUsed(value: unknown): JobFinancialView["productsUsed"] {
  let arr: unknown = value;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: JobFinancialView["productsUsed"] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const quantity = Number(p.quantity);
    const unitPrice = Number(p.unitPrice);
    out.push({
      productId: String(p.productId ?? ""),
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    });
  }
  return out;
}

/**
 * Suma de cobros MARCADOS de un trabajo, en centavos. Mismo criterio canónico
 * que el ledger (`relatedJobId` + `isJobPayment`), sin category/description.
 * Devuelve null si alguna fila del ledger es ilegible o la suma se va de rango:
 * en ese caso el saldo del trabajo no es computable y se marca dataIssue.
 */
export function sumMarkedPaymentsCents(
  transactions: RawTransactionRow[],
  jobId: number,
): number | null {
  let total = 0;
  for (const t of transactions) {
    if (t.relatedJobId !== jobId || t.isJobPayment !== true) continue;
    const cents = readStoredMoneyCents(t.amount);
    if (cents === null || cents < 0) return null;
    total += cents;
    if (!Number.isSafeInteger(total) || total > MAX_AMOUNT_CENTS) return null;
  }
  return total;
}

/**
 * Fecha desde la que corre el crédito comercial: la de la factura si existe,
 * si no la de fin de trabajo, y como último recurso la de inicio.
 */
function resolveReferenceDate(meta: Record<string, unknown>, row: RawJobRow): string {
  const invoiceDate = readString(meta.invoiceDate);
  if (invoiceDate) return invoiceDate;
  const endDate = readString(row.endDate);
  if (endDate) return endDate;
  return readString(row.startDate);
}

export function buildJobFinancialView(
  row: RawJobRow,
  transactions: RawTransactionRow[],
): JobFinancialView {
  const meta = parseJobMeta(row.notes);
  const issues: string[] = [];

  const laborCents = readStoredMoneyCents(meta.laborCost);
  const materialsCents = readStoredMoneyCents(meta.materialsCost);
  const otherCents = readStoredMoneyCents(meta.otherCosts);
  if (laborCents === null || materialsCents === null || otherCents === null) {
    issues.push("costos ilegibles");
  }
  const subtotalCents = (laborCents ?? 0) + (materialsCents ?? 0) + (otherCents ?? 0);

  // El IVA es obligatorio para hablar de un total facturable; sin alícuota, el
  // total no se asume (el propio registerPayment rechaza cobrar en ese estado).
  const ivaRate = readStoredRate(meta.ivaRate);
  if (ivaRate === null) issues.push("sin alícuota de IVA definida");
  const ivaCents = ivaRate === null ? 0 : Math.round((subtotalCents * ivaRate) / 100);
  const totalCents = subtotalCents + ivaCents;

  // Cobrado canónico. legacyPaidBase NULL ⇒ trabajo previo al cutover: su
  // histórico sigue en el cache `amountPaid`.
  const markedCents = sumMarkedPaymentsCents(transactions, row.id);
  if (markedCents === null) issues.push("ledger de cobros ilegible");

  let baseCents: number | null;
  if (row.legacyPaidBase === undefined || row.legacyPaidBase === null || row.legacyPaidBase === "") {
    baseCents = readStoredMoneyCents(meta.amountPaid);
    if (baseCents === null) issues.push("monto cobrado histórico ilegible");
  } else {
    baseCents = readStoredMoneyCents(row.legacyPaidBase);
    if (baseCents === null) issues.push("base de cobros ilegible");
  }

  const paidCents = (baseCents ?? 0) + (markedCents ?? 0);
  const balanceCents = totalCents - paidCents;

  return {
    id: row.id,
    jobNumber: readString(row.jobNumber),
    title: readString(row.title),
    status: readString(row.status) || "pending",
    customerId: typeof row.customerId === "number" ? row.customerId : null,
    customerName: readString(row.customerName),
    customerPhone: readString(row.customerPhone),
    currency: readCurrency(meta.currency),
    subtotalCents,
    ivaRate,
    totalCents,
    paidCents,
    balanceCents,
    referenceDate: resolveReferenceDate(meta, row),
    invoiceNumber: readString(row.invoiceNumber),
    invoiceDate: readString(meta.invoiceDate),
    dueDate: readString(meta.dueDate),
    startDate: readString(row.startDate),
    endDate: readString(row.endDate),
    budgetStatus: readString(meta.budgetStatus) || "not_needed",
    productsUsed: readProductsUsed(meta.productsUsed),
    dataIssue: issues.length > 0 ? issues.join("; ") : null,
  };
}

/** Importe legible en la divisa del trabajo, para prompts y UI. */
export function formatMoney(cents: number, currency: JobCurrency): string {
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${centsToNumber(cents).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
