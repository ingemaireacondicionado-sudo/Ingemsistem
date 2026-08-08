export type TransactionType = 'income' | 'expense';
export type TransactionCategory = 
  | 'sales'           // Ventas
  | 'services'        // Servicios
  | 'purchases'       // Compras
  | 'salaries'        // Sueldos
  | 'rent'            // Alquiler
  | 'utilities'       // Servicios (luz, gas, agua)
  | 'transport'       // Transporte
  | 'materials'       // Materiales
  | 'tools'           // Herramientas
  | 'taxes'           // Impuestos
  | 'insurance'       // Seguros
  | 'maintenance'     // Mantenimiento
  | 'marketing'       // Publicidad
  | 'other_income'    // Otros ingresos
  | 'other_expense';  // Otros gastos

export type PaymentMethod = 
  | 'cash'            // Efectivo
  | 'bank_transfer'   // Transferencia bancaria
  | 'debit_card'      // Tarjeta de débito
  | 'credit_card'     // Tarjeta de crédito
  | 'check'           // Cheque
  | 'mercadopago'     // MercadoPago
  | 'other';          // Otro

export interface Transaction {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amount: number;           // Monto sin IVA
  ivaRate: number;          // % de IVA (0, 10.5, 21, 27)
  ivaAmount: number;        // Monto del IVA
  totalAmount: number;      // Monto total (con IVA)
  date: string;
  paymentMethod: PaymentMethod;
  relatedClientId?: string;
  relatedClientName?: string;
  relatedSupplierId?: string;
  relatedSupplierName?: string;
  invoiceNumber?: string;   // Número de factura
  invoiceType?: string;     // Tipo de factura (A, B, C, etc.)
  cuitComprador?: string;   // CUIT del comprador
  cuitVendedor?: string;    // CUIT del vendedor
  relatedJobId?: string;    // ID del trabajo relacionado (para rentabilidad)
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionFormData {
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amount: number;
  ivaRate: number;
  date: string;
  paymentMethod: PaymentMethod;
  relatedClientId?: string;
  relatedSupplierId?: string;
  invoiceNumber?: string;
  invoiceType?: string;
  cuitComprador?: string;
  cuitVendedor?: string;
  relatedJobId?: string;
  notes: string;
}

// Categorías de ingresos
export const INCOME_CATEGORIES: { value: TransactionCategory; label: string; icon: string }[] = [
  { value: 'sales', label: 'Ventas de Productos', icon: '📦' },
  { value: 'services', label: 'Servicios', icon: '🔧' },
  { value: 'other_income', label: 'Otros Ingresos', icon: '💰' },
];

// Categorías de gastos
export const EXPENSE_CATEGORIES: { value: TransactionCategory; label: string; icon: string }[] = [
  { value: 'purchases', label: 'Compras', icon: '🛒' },
  { value: 'salaries', label: 'Sueldos', icon: '👷' },
  { value: 'rent', label: 'Alquiler', icon: '🏢' },
  { value: 'utilities', label: 'Servicios (Luz/Gas/Agua)', icon: '💡' },
  { value: 'transport', label: 'Transporte', icon: '🚚' },
  { value: 'materials', label: 'Materiales', icon: '🔩' },
  { value: 'tools', label: 'Herramientas', icon: '🛠️' },
  { value: 'taxes', label: 'Impuestos', icon: '📋' },
  { value: 'insurance', label: 'Seguros', icon: '🛡️' },
  { value: 'maintenance', label: 'Mantenimiento', icon: '🔨' },
  { value: 'marketing', label: 'Publicidad', icon: '📢' },
  { value: 'other_expense', label: 'Otros Gastos', icon: '📄' },
];

// Todas las categorías
export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

// Tasas de IVA en Argentina
export const IVA_RATES = [
  { value: 0, label: '0% (Exento)' },
  { value: 10.5, label: '10.5%' },
  { value: 21, label: '21%' },
  { value: 27, label: '27%' },
];

// Métodos de pago
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo', icon: '💵' },
  { value: 'bank_transfer', label: 'Transferencia Bancaria', icon: '🏦' },
  { value: 'debit_card', label: 'Tarjeta de Débito', icon: '💳' },
  { value: 'credit_card', label: 'Tarjeta de Crédito', icon: '💳' },
  { value: 'check', label: 'Cheque', icon: '📄' },
  { value: 'mercadopago', label: 'MercadoPago', icon: '📱' },
  { value: 'other', label: 'Otro', icon: '📝' },
];

// Tipos de factura
export const INVOICE_TYPES = [
  { value: 'A', label: 'Factura A' },
  { value: 'B', label: 'Factura B' },
  { value: 'C', label: 'Factura C' },
  { value: 'M', label: 'Factura M' },
  { value: 'E', label: 'Factura E' },
  { value: 'X', label: 'Sin factura' },
];

// Función para calcular IVA
export function calculateIVA(amount: number, ivaRate: number): { ivaAmount: number; totalAmount: number } {
  const ivaAmount = (amount * ivaRate) / 100;
  const totalAmount = amount + ivaAmount;
  return { ivaAmount, totalAmount };
}

// Función para formatear moneda argentina
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
}

// Función para obtener el color según tipo
export function getTransactionTypeColor(type: TransactionType): string {
  return type === 'income' 
    ? 'text-emerald-600 bg-emerald-100' 
    : 'text-red-600 bg-red-100';
}

export function getTransactionTypeLabel(type: TransactionType): string {
  return type === 'income' ? 'Ingreso' : 'Gasto';
}

// Función para obtener la categoría
export function getCategoryLabel(category: TransactionCategory): string {
  const cat = ALL_CATEGORIES.find(c => c.value === category);
  return cat ? `${cat.icon} ${cat.label}` : category;
}

// Función para obtener el método de pago
export function getPaymentMethodLabel(method: PaymentMethod): string {
  const pm = PAYMENT_METHODS.find(p => p.value === method);
  return pm ? `${pm.icon} ${pm.label}` : method;
}
