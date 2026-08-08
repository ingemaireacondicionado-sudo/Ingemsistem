import type { Job } from '@/types/job';
import type { Product } from '@/types/product';
import type { Transaction } from '@/types/transaction';

export interface JobMarginResult {
  /** Costo de productos usados (en la divisa del trabajo) */
  productsCost: number;
  /** Total de gastos imputados en ARS (neto de IVA) */
  expensesARS: number;
  /** Total de gastos imputados en USD (neto de IVA) - solo si hay gastos USD en trabajo ARS o viceversa */
  expensesUSD: number;
  /** Margen en ARS (solo si job es ARS) */
  marginARS: number;
  /** Margen en USD (solo si job es USD) */
  marginUSD: number;
  /** Porcentaje de margen (null si hay divisas mixtas) */
  marginPct: number | null;
  /** Indica si hay divisas mixtas (job USD con gastos ARS o viceversa) */
  mixedCurrencies: boolean;
  /** Subtotal sin IVA del trabajo */
  subtotal: number;
  /** Divisa del trabajo */
  currency: 'ARS' | 'USD';
}

/**
 * Calcula el margen de un trabajo.
 * 
 * Fórmula: margin = subtotal_sin_IVA - Σ(productsUsed × purchasePrice) - Σ(gastos con relatedJobId, neto de IVA)
 * 
 * Si el trabajo es USD y tiene gastos en ARS (o viceversa), se muestran ambos montos
 * separados y no se calcula porcentaje de margen.
 * 
 * Nota: Los gastos de transacciones se toman por su campo `amount` (neto de IVA).
 * Los ingresos con relatedJobId NO se restan (son cobros del trabajo, no costos).
 */
export function calculateJobMargin(
  job: Job,
  products: Product[],
  transactions: Transaction[]
): JobMarginResult {
  const subtotal = job.subtotal; // ya es sin IVA
  const currency = job.currency;

  // 1. Costo de productos usados (usando purchasePrice del producto actual)
  let productsCost = 0;
  for (const pu of job.productsUsed) {
    const product = products.find(p => p.id === pu.productId);
    if (product) {
      productsCost += pu.quantity * product.purchasePrice;
    } else {
      // Si no encontramos el producto, usamos el unitPrice del registro (es el precio de venta, no costo)
      // Esto es un fallback imperfecto - idealmente siempre se encuentra el producto
      productsCost += pu.quantity * pu.unitPrice * 0.7; // estimación conservadora
    }
  }

  // 2. Gastos imputados al trabajo (solo expenses, no incomes)
  const jobExpenses = transactions.filter(
    t => t.relatedJobId === job.id && t.type === 'expense'
  );

  // Separar por divisa - asumimos que las transacciones son en ARS salvo que 
  // el trabajo sea USD y no haya indicación contraria
  // Como las transacciones no tienen campo de divisa, asumimos ARS por defecto
  const expensesARS = jobExpenses.reduce((sum, t) => sum + t.amount, 0);
  const expensesUSD = 0; // Las transacciones son siempre en ARS en el sistema actual

  // 3. Determinar si hay divisas mixtas
  const mixedCurrencies = currency === 'USD' && expensesARS > 0;

  // 4. Calcular margen
  let marginARS = 0;
  let marginUSD = 0;
  let marginPct: number | null = null;

  if (currency === 'ARS') {
    marginARS = subtotal - productsCost - expensesARS;
    marginPct = subtotal > 0 ? (marginARS / subtotal) * 100 : null;
  } else {
    // Job en USD
    marginUSD = subtotal - productsCost;
    if (!mixedCurrencies) {
      marginPct = subtotal > 0 ? (marginUSD / subtotal) * 100 : null;
    }
    // Si hay gastos ARS, no podemos calcular % porque son divisas distintas
  }

  return {
    productsCost,
    expensesARS,
    expensesUSD,
    marginARS,
    marginUSD,
    marginPct,
    mixedCurrencies,
    subtotal,
    currency,
  };
}

/**
 * Formatea el margen para mostrar en un chip/badge.
 * Retorna texto como "+32%" o "ARS 45.000" o "USD 1.200 | -ARS 15.000 gastos"
 */
export function formatMarginChip(result: JobMarginResult): string {
  if (result.subtotal === 0) return '—';

  if (result.marginPct !== null) {
    const sign = result.marginPct >= 0 ? '+' : '';
    return `${sign}${result.marginPct.toFixed(0)}%`;
  }

  // Divisas mixtas
  if (result.currency === 'USD') {
    const parts: string[] = [];
    if (result.marginUSD !== 0) {
      parts.push(`USD ${formatNum(result.marginUSD)}`);
    }
    if (result.expensesARS > 0) {
      parts.push(`-ARS ${formatNum(result.expensesARS)}`);
    }
    return parts.join(' | ') || '—';
  }

  return '—';
}

/**
 * Retorna el color CSS para el chip de margen.
 */
export function getMarginColor(result: JobMarginResult): string {
  if (result.marginPct === null) return 'text-amber-600 bg-amber-50';
  if (result.marginPct >= 30) return 'text-emerald-700 bg-emerald-50';
  if (result.marginPct >= 15) return 'text-emerald-600 bg-emerald-50';
  if (result.marginPct >= 0) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

/**
 * Calcula la ganancia neta mensual:
 * = Σ(márgenes de trabajos del mes) + Σ(ingresos SIN relatedJobId) - Σ(gastos SIN relatedJobId)
 * 
 * Los ingresos CON relatedJobId ya están contados en el margen del trabajo,
 * por lo que no se suman de nuevo (evita doble conteo).
 */
export function calculateNetMonthlyProfit(
  jobs: Job[],
  products: Product[],
  transactions: Transaction[],
  year: number,
  month: number
): { profitARS: number; profitUSD: number; jobMarginsARS: number; jobMarginsUSD: number; generalIncomeARS: number; generalExpensesARS: number } {
  // Filtrar trabajos del mes (por startDate)
  const monthJobs = jobs.filter(j => {
    if (!j.startDate) return false;
    const parts = j.startDate.split('-');
    return parseInt(parts[0]) === year && parseInt(parts[1]) === month + 1;
  });

  // Calcular márgenes de trabajos
  let jobMarginsARS = 0;
  let jobMarginsUSD = 0;
  for (const job of monthJobs) {
    if (job.status === 'cancelled') continue;
    const margin = calculateJobMargin(job, products, transactions);
    jobMarginsARS += margin.marginARS;
    jobMarginsUSD += margin.marginUSD;
  }

  // Filtrar transacciones del mes
  const monthTransactions = transactions.filter(t => {
    if (!t.date) return false;
    const parts = t.date.split('-');
    return parseInt(parts[0]) === year && parseInt(parts[1]) === month + 1;
  });

  // Ingresos SIN relatedJobId (no están contados en márgenes de trabajos)
  const generalIncomeARS = monthTransactions
    .filter(t => t.type === 'income' && !t.relatedJobId)
    .reduce((sum, t) => sum + t.amount, 0);

  // Gastos SIN relatedJobId (gastos generales, no imputados a ningún trabajo)
  const generalExpensesARS = monthTransactions
    .filter(t => t.type === 'expense' && !t.relatedJobId)
    .reduce((sum, t) => sum + t.amount, 0);

  const profitARS = jobMarginsARS + generalIncomeARS - generalExpensesARS;
  const profitUSD = jobMarginsUSD;

  return { profitARS, profitUSD, jobMarginsARS, jobMarginsUSD, generalIncomeARS, generalExpensesARS };
}

function formatNum(n: number): string {
  return Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
