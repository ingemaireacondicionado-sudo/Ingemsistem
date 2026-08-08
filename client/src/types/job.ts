export type JobStatus = 'pending' | 'in_progress' | 'completed' | 'invoiced' | 'paid' | 'cancelled';
export type InvoiceType = 'A' | 'B' | 'C' | 'consumidor_final' | 'nota_debito' | 'nota_credito' | 'presupuesto' | 'none';
export type BudgetStatus = 'not_needed' | 'pending' | 'approved' | 'rejected';
export type JobCurrency = 'ARS' | 'USD';

export interface Job {
  id: string;
  jobNumber: string;              // Número interno del trabajo
  
  // Cliente
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientCuit: string;
  
  // Estado del trabajo
  status: JobStatus;
  
  // Descripción del trabajo
  title: string;
  description: string;
  details: string;                // Detalle técnico del trabajo realizado
  
  // Fechas
  startDate: string;
  endDate?: string;
  dueDate?: string;               // Fecha comprometida de entrega
  
  // Presupuesto
  budgetStatus: BudgetStatus;
  budgetNumber?: string;
  budgetAmount?: number;
  budgetDate?: string;
  budgetSentDate?: string;
  budgetWorksite?: string;
  budgetDiscountType?: 'percent' | 'fixed';
  budgetDiscountValue?: number;
  budgetPaymentTerms?: string;
  budgetDeliveryTerm?: string;
  budgetWarranty?: string;
  budgetConditions?: string;
  
  // Orden de compra
  hasPurchaseOrder: boolean;
  purchaseOrderNumber?: string;
  purchaseOrderDate?: string;
  purchaseOrderFileUrl?: string;
  
  // Facturación
  needsInvoice: boolean;
  invoiceType: InvoiceType;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceFileUrl?: string;
  
  // Consumidor final
  isConsumerFinal: boolean;
  consumerFinalName?: string;
  consumerFinalDni?: string;
  consumerFinalAddress?: string;
  
  // Divisa
  currency: JobCurrency;
  
  // Montos
  laborCost: number;              // Mano de obra
  materialsCost: number;          // Materiales
  otherCosts: number;             // Otros gastos
  subtotal: number;               // Subtotal (sin IVA)
  ivaRate: number;                // % IVA
  ivaAmount: number;              // Monto IVA
  totalAmount: number;            // Total con IVA
  amountPaid: number;             // Monto cobrado/pagado
  balanceDue: number;             // Saldo pendiente
  
  // Productos/Materiales usados
  productsUsed: JobProduct[];
  
  // Técnicos asignados
  technicianIds: string[];
  technicianNames: string[];
  
  // Notas
  notes: string;
  invoiceNotes: string;           // Notas específicas para la factura
  
  // Metadatos
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobProduct {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface JobFormData {
  jobNumber: string;
  clientId: string;
  status: JobStatus;
  currency: JobCurrency;
  title: string;
  description: string;
  details: string;
  startDate: string;
  endDate?: string;
  dueDate?: string;
  budgetStatus: BudgetStatus;
  budgetNumber?: string;
  budgetAmount?: number;
  budgetDate?: string;
  budgetSentDate?: string;
  budgetWorksite?: string;
  budgetDiscountType?: 'percent' | 'fixed';
  budgetDiscountValue?: number;
  budgetPaymentTerms?: string;
  budgetDeliveryTerm?: string;
  budgetWarranty?: string;
  budgetConditions?: string;
  hasPurchaseOrder: boolean;
  purchaseOrderNumber?: string;
  purchaseOrderDate?: string;
  purchaseOrderFileUrl?: string;
  needsInvoice: boolean;
  invoiceType: InvoiceType;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceFileUrl?: string;
  isConsumerFinal: boolean;
  consumerFinalName?: string;
  consumerFinalDni?: string;
  consumerFinalAddress?: string;
  laborCost: number;
  materialsCost: number;
  otherCosts: number;
  ivaRate: number;
  productsUsed: JobProduct[];
  technicianIds: string[];
  notes: string;
  invoiceNotes: string;
}

// Estados del trabajo
export const JOB_STATUS = {
  pending: { 
    label: 'Pendiente', 
    color: 'bg-amber-100 text-amber-700',
    description: 'Trabajo aún no iniciado'
  },
  in_progress: { 
    label: 'En Progreso', 
    color: 'bg-blue-100 text-blue-700',
    description: 'Trabajo en curso'
  },
  completed: { 
    label: 'Completado', 
    color: 'bg-emerald-100 text-emerald-700',
    description: 'Trabajo finalizado, pendiente de facturar'
  },
  invoiced: { 
    label: 'Facturado', 
    color: 'bg-purple-100 text-purple-700',
    description: 'Factura emitida'
  },
  paid: { 
    label: 'Cobrado', 
    color: 'bg-green-100 text-green-700',
    description: 'Trabajo completamente pagado'
  },
  cancelled: { 
    label: 'Cancelado', 
    color: 'bg-slate-100 text-slate-500',
    description: 'Trabajo cancelado'
  },
};

// Tipos de factura
export const INVOICE_TYPE_OPTIONS = {
  A: { label: 'Factura A', icon: '📄' },
  B: { label: 'Factura B', icon: '📄' },
  C: { label: 'Factura C', icon: '📄' },
  consumidor_final: { label: 'Consumidor Final', icon: '👤' },
  nota_debito: { label: 'Nota de Débito', icon: '📈' },
  nota_credito: { label: 'Nota de Crédito', icon: '📉' },
  presupuesto: { label: 'Solo Presupuesto', icon: '📋' },
  none: { label: 'Sin Facturar', icon: '⛔' },
};

// Estados de presupuesto
export const BUDGET_STATUS = {
  not_needed: { label: 'No necesita presupuesto', color: 'bg-slate-100 text-slate-500' },
  pending: { label: 'Pendiente de aprobación', color: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Presupuesto aprobado', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Presupuesto rechazado', color: 'bg-red-100 text-red-700' },
};

// Tasas de IVA
export const JOB_IVA_RATES = [
  { value: 0, label: '0% (Exento)' },
  { value: 10.5, label: '10.5%' },
  { value: 21, label: '21%' },
  { value: 27, label: '27%' },
];

// Función para calcular totales
export function calculateJobTotals(
  laborCost: number,
  materialsCost: number,
  otherCosts: number,
  ivaRate: number
): { subtotal: number; ivaAmount: number; totalAmount: number } {
  const subtotal = laborCost + materialsCost + otherCosts;
  const ivaAmount = (subtotal * ivaRate) / 100;
  const totalAmount = subtotal + ivaAmount;
  return { subtotal, ivaAmount, totalAmount };
}

// Función para formatear moneda
export function formatCurrency(amount: number, currency: JobCurrency = 'ARS'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
}

// Símbolo de divisa
export function getCurrencySymbol(currency: JobCurrency = 'ARS'): string {
  return currency === 'USD' ? 'US$' : '$';
}

// Opciones de divisa
export const CURRENCY_OPTIONS: { value: JobCurrency; label: string; symbol: string }[] = [
  { value: 'ARS', label: 'Pesos Argentinos', symbol: '$' },
  { value: 'USD', label: 'Dólares', symbol: 'US$' },
];

// Función para generar número de trabajo
export function generateJobNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `TR-${year}${month}-${random}`;
}

// Función para generar número de presupuesto
export function generateBudgetNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PR-${year}${month}-${random}`;
}
