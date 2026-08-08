import type { JobProduct } from '@/types/job';

export interface BudgetItem {
  id: string;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
}

export function buildBudgetProducts(items: BudgetItem[]): JobProduct[] {
  return items
    .filter(item => item.description.trim() && Number(item.quantity) > 0 && Number(item.unitPrice) > 0)
    .map(item => ({
      productId: '',
      productName: item.description.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.quantity) * Number(item.unitPrice),
      purchasePrice: 0,
    }));
}

export function getFallbackBudgetNumber(nextBudgetNumber?: string, editingBudgetNumber?: string): string {
  return editingBudgetNumber || nextBudgetNumber || `PR-${String(Date.now()).slice(-4)}`;
}

export function validateBudgetBeforeSave({
  title,
  clientName,
  grossSubtotal,
}: {
  title: string;
  clientName: string;
  grossSubtotal: number;
}): string | null {
  if (!title.trim()) return 'Ingresá un título para el presupuesto';
  if (!clientName.trim()) return 'Seleccioná o ingresá un cliente';
  if (!Number.isFinite(grossSubtotal) || grossSubtotal <= 0) {
    return 'El presupuesto debe tener al menos un ítem con valor';
  }
  return null;
}
