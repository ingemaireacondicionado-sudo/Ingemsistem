import { useCallback, useMemo } from 'react';
import type { Transaction, TransactionFormData } from '@/types/transaction';
import { trpc } from '@/lib/trpc';

export function useTransactions() {
  const q = trpc.transactions.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.transactions.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.transactions.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.transactions.delete.useMutation({ onSuccess: () => q.refetch() });

  const transactions: Transaction[] = useMemo(() =>
    (q.data ?? []).map((t: any) => ({
      id: String(t.id), type: t.type ?? 'income', category: t.category ?? '',
      description: t.description ?? '', amount: parseFloat(t.amount ?? '0'),
      ivaRate: parseFloat(t.ivaRate ?? '21'), ivaAmount: parseFloat(t.ivaAmount ?? '0'),
      totalAmount: parseFloat(t.totalWithIva ?? '0'),
      date: t.date ?? '', paymentMethod: t.paymentMethod ?? 'cash',
      relatedClientId: t.customerId ? String(t.customerId) : undefined,
      relatedClientName: t.customerName || undefined,
      relatedSupplierId: t.supplierId ? String(t.supplierId) : undefined,
      relatedSupplierName: t.supplierName || undefined,
      invoiceNumber: t.invoiceNumber || undefined, invoiceType: t.invoiceType || undefined,
      cuitComprador: t.cuitComprador || undefined, cuitVendedor: t.cuitVendedor || undefined,
      relatedJobId: t.relatedJobId ? String(t.relatedJobId) : undefined,
      notes: t.notes ?? '', createdBy: t.createdBy ?? '',
      createdAt: t.createdAt ? _toLocal(new Date(t.createdAt)) : '',
      updatedAt: t.updatedAt ? _toLocal(new Date(t.updatedAt)) : '',
    })), [q.data]);

  const addTransaction = useCallback(async (data: TransactionFormData, createdBy: string): Promise<string> => {
    const ivaAmount = (data.amount * data.ivaRate) / 100;
    const totalWithIva = data.amount + ivaAmount;
    const result = await cM.mutateAsync({
      type: data.type, category: data.category, description: data.description,
      amount: String(data.amount), date: data.date, paymentMethod: data.paymentMethod,
      status: 'completed', reference: '',
      customerId: data.relatedClientId ? parseInt(data.relatedClientId) : null,
      customerName: '', supplierId: data.relatedSupplierId ? parseInt(data.relatedSupplierId) : null,
      supplierName: '', invoiceType: data.invoiceType ?? '', invoiceNumber: data.invoiceNumber ?? '',
      ivaRate: String(data.ivaRate), ivaAmount: String(ivaAmount), totalWithIva: String(totalWithIva),
      cuitComprador: data.cuitComprador ?? '', cuitVendedor: data.cuitVendedor ?? '',
      relatedJobId: data.relatedJobId ? parseInt(data.relatedJobId) : null,
      notes: data.notes,
    });
    return String(result.id);
  }, [cM]);

  const updateTransaction = useCallback(async (id: string, data: TransactionFormData) => {
    const ivaAmount = (data.amount * data.ivaRate) / 100;
    const totalWithIva = data.amount + ivaAmount;
    await uM.mutateAsync({
      id: parseInt(id), type: data.type, category: data.category, description: data.description,
      amount: String(data.amount), date: data.date, paymentMethod: data.paymentMethod,
      customerId: data.relatedClientId ? parseInt(data.relatedClientId) : null,
      supplierId: data.relatedSupplierId ? parseInt(data.relatedSupplierId) : null,
      invoiceType: data.invoiceType, invoiceNumber: data.invoiceNumber,
      ivaRate: String(data.ivaRate), ivaAmount: String(ivaAmount), totalWithIva: String(totalWithIva),
      cuitComprador: data.cuitComprador ?? '', cuitVendedor: data.cuitVendedor ?? '',
      relatedJobId: data.relatedJobId ? parseInt(data.relatedJobId) : null,
      notes: data.notes,
    });
  }, [uM]);

  const deleteTransaction = useCallback(async (id: string) => { await dM.mutateAsync({ id: parseInt(id) }); }, [dM]);
  const getTransactionById = useCallback((id: string) => transactions.find(t => t.id === id), [transactions]);
  const getIncomes = useCallback(() => transactions.filter(t => t.type === 'income'), [transactions]);
  const getExpenses = useCallback(() => transactions.filter(t => t.type === 'expense'), [transactions]);
  const getByPeriod = useCallback((year: number, month: number) =>
    transactions.filter(t => { const d = new Date(t.date); return d.getFullYear() === year && d.getMonth() === month; }),
    [transactions]);
  const getByDateRange = useCallback((startDate: string, endDate: string) =>
    transactions.filter(t => t.date >= startDate && t.date <= endDate), [transactions]);

  const getStats = useCallback((startDate?: string, endDate?: string) => {
    const filtered = startDate && endDate ? transactions.filter(t => t.date >= startDate && t.date <= endDate) : transactions;
    const incomes = filtered.filter(t => t.type === 'income');
    const expenses = filtered.filter(t => t.type === 'expense');
    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;
    const byCategory: Record<string, number> = {};
    filtered.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + t.amount; });
    const ivaDebit = incomes.reduce((s, t) => s + (t.ivaAmount ?? 0), 0);
    const ivaCredit = expenses.reduce((s, t) => s + (t.ivaAmount ?? 0), 0);
    const ivaBalance = ivaDebit - ivaCredit;
    const byPaymentMethod: Record<string, number> = {};
    filtered.forEach(t => { byPaymentMethod[t.paymentMethod] = (byPaymentMethod[t.paymentMethod] || 0) + t.amount; });
    return { totalIncome, totalExpense, balance, totalTransactions: filtered.length, incomeCount: incomes.length, expenseCount: expenses.length, byCategory, ivaDebit, ivaCredit, ivaBalance, byPaymentMethod };
  }, [transactions]);

  const getMonthlyComparison = useCallback((year: number) => {
    const months = [];
    for (let m = 0; m < 12; m++) {
      const mt = getByPeriod(year, m);
      const income = mt.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = mt.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      months.push({ month: m, income, expense, balance: income - expense });
    }
    return months;
  }, [getByPeriod]);

  return { transactions, addTransaction, updateTransaction, deleteTransaction, getTransactionById, getIncomes, getExpenses, getByPeriod, getByDateRange, getStats, getMonthlyComparison };
}

function _toLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
