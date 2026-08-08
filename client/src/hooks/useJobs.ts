import { useCallback, useMemo } from 'react';
import type { Job, JobFormData, JobProduct, JobStatus, JobCurrency } from '@/types/job';
import { calculateJobTotals } from '@/types/job';
import { trpc } from '@/lib/trpc';

function tryParse(val: any, fallback: any) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
  return fallback;
}

export function useJobs() {
  const q = trpc.jobs.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.jobs.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.jobs.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.jobs.delete.useMutation({ onSuccess: () => q.refetch() });

  const jobs: Job[] = useMemo(() =>
    (q.data ?? []).map((j: any) => {
      const rawNotes = j.notes ?? '';
      let meta: any = {};
      try { meta = rawNotes.startsWith('{') ? JSON.parse(rawNotes) : {}; } catch { meta = {}; }
      const laborCost = parseFloat(meta.laborCost ?? '0');
      const materialsCost = parseFloat(meta.materialsCost ?? '0');
      const otherCosts = parseFloat(meta.otherCosts ?? '0');
      const ivaRate = parseFloat(meta.ivaRate ?? '21');
      const totals = calculateJobTotals(laborCost, materialsCost, otherCosts, ivaRate);
      const statusMap: Record<string, JobStatus> = {
        'pending': 'pending', 'in-progress': 'in_progress', 'in_progress': 'in_progress',
        'completed': 'completed', 'invoiced': 'invoiced', 'paid': 'paid',
        'collected': 'paid', 'cancelled': 'cancelled',
      };
      return {
        id: String(j.id), jobNumber: j.jobNumber ?? '',
        clientId: j.customerId ? String(j.customerId) : '',
        clientName: j.customerName ?? '', clientPhone: j.customerPhone ?? '',
        clientCuit: j.customerCuit ?? '',
        status: (statusMap[j.status] ?? 'pending') as JobStatus,
        title: j.title ?? '', description: j.description ?? '',
        details: meta.details ?? '',
        startDate: j.startDate ?? '', endDate: j.endDate || undefined,
        dueDate: meta.dueDate || undefined,
        budgetStatus: meta.budgetStatus ?? 'not_needed',
        budgetNumber: j.budgetNumber || undefined,
        budgetAmount: parseFloat(j.budgetAmount ?? '0') || undefined,
        budgetDate: meta.budgetDate || undefined,
        budgetSentDate: meta.budgetSentDate || undefined,
        budgetWorksite: meta.budgetWorksite || undefined,
        budgetDiscountType: meta.budgetDiscountType || undefined,
        budgetDiscountValue: parseFloat(meta.budgetDiscountValue ?? '0') || undefined,
        budgetPaymentTerms: meta.budgetPaymentTerms || undefined,
        budgetDeliveryTerm: meta.budgetDeliveryTerm || undefined,
        budgetWarranty: meta.budgetWarranty || undefined,
        budgetConditions: meta.budgetConditions || undefined,
        hasPurchaseOrder: !!j.purchaseOrder,
        purchaseOrderNumber: j.purchaseOrder || undefined,
        purchaseOrderDate: meta.purchaseOrderDate || undefined,
        purchaseOrderFileUrl: meta.purchaseOrderFileUrl || undefined,
        needsInvoice: meta.needsInvoice ?? false,
        invoiceType: meta.invoiceType ?? 'none',
        invoiceNumber: j.invoiceNumber || undefined,
        invoiceDate: meta.invoiceDate || undefined,
        invoiceFileUrl: meta.invoiceFileUrl || undefined,
        isConsumerFinal: meta.isConsumerFinal ?? false,
        consumerFinalName: meta.consumerFinalName || undefined,
        consumerFinalDni: meta.consumerFinalDni || undefined,
        consumerFinalAddress: meta.consumerFinalAddress || undefined,
        currency: (meta.currency ?? 'ARS') as JobCurrency,
        laborCost, materialsCost, otherCosts,
        subtotal: totals.subtotal, ivaRate, ivaAmount: totals.ivaAmount,
        totalAmount: totals.totalAmount,
        amountPaid: parseFloat(meta.amountPaid ?? '0'),
        balanceDue: totals.totalAmount - parseFloat(meta.amountPaid ?? '0'),
        productsUsed: tryParse(meta.productsUsed, []) as JobProduct[],
        technicianIds: tryParse(j.technicianIds, []),
        technicianNames: tryParse(j.technicianNames, []),
        notes: meta.userNotes ?? '',
        invoiceNotes: meta.invoiceNotes ?? '',
        createdBy: meta.createdBy ?? '', createdByName: meta.createdByName ?? '',
        createdAt: j.createdAt ? new Date(j.createdAt).toISOString().split('T')[0] : '',
        updatedAt: j.updatedAt ? new Date(j.updatedAt).toISOString().split('T')[0] : '',
      };
    }), [q.data]);

  const addJob = useCallback(async (data: JobFormData, clientName: string, clientPhone: string, clientCuit: string, technicianNames: string[], createdBy: string, createdByName: string): Promise<string> => {
    const totals = calculateJobTotals(data.laborCost, data.materialsCost, data.otherCosts, data.ivaRate);
    const statusMap: Record<string, string> = {
      'pending': 'pending', 'in_progress': 'in-progress', 'completed': 'completed',
      'invoiced': 'invoiced', 'paid': 'collected', 'cancelled': 'pending',
    };
    const meta = JSON.stringify({
      details: data.details, dueDate: data.dueDate, budgetStatus: data.budgetStatus,
      budgetDate: data.budgetDate, budgetSentDate: data.budgetSentDate,
      budgetWorksite: data.budgetWorksite, budgetDiscountType: data.budgetDiscountType,
      budgetDiscountValue: data.budgetDiscountValue, budgetPaymentTerms: data.budgetPaymentTerms,
      budgetDeliveryTerm: data.budgetDeliveryTerm, budgetWarranty: data.budgetWarranty,
      budgetConditions: data.budgetConditions,
      purchaseOrderDate: data.purchaseOrderDate,
      purchaseOrderFileUrl: data.purchaseOrderFileUrl,
      needsInvoice: data.needsInvoice, invoiceType: data.invoiceType,
      invoiceDate: data.invoiceDate, invoiceFileUrl: data.invoiceFileUrl,
      isConsumerFinal: data.isConsumerFinal,
      consumerFinalName: data.consumerFinalName, consumerFinalDni: data.consumerFinalDni,
      consumerFinalAddress: data.consumerFinalAddress,
      currency: data.currency ?? 'ARS',
      laborCost: data.laborCost, materialsCost: data.materialsCost, otherCosts: data.otherCosts,
      ivaRate: data.ivaRate, amountPaid: 0, productsUsed: data.productsUsed,
      userNotes: data.notes, invoiceNotes: data.invoiceNotes,
      createdBy, createdByName,
    });
    const result = await cM.mutateAsync({
      jobNumber: data.jobNumber, title: data.title, description: data.description,
      status: (statusMap[data.status] ?? 'pending') as any,
      customerId: data.clientId ? parseInt(data.clientId) : null,
      customerName: clientName, customerPhone: clientPhone, customerCuit: clientCuit,
      technicianIds: JSON.stringify(data.technicianIds),
      technicianNames: JSON.stringify(technicianNames),
      productIds: JSON.stringify(data.productsUsed.map((p: JobProduct) => p.productId)),
      budgetNumber: data.budgetNumber ?? '', budgetAmount: String(data.budgetAmount ?? 0),
      invoiceNumber: data.invoiceNumber ?? '', invoiceAmount: String(totals.totalAmount),
      purchaseOrder: data.hasPurchaseOrder ? (data.purchaseOrderNumber ?? 'SI') : '',
      paymentStatus: 'pending', startDate: data.startDate, endDate: data.endDate ?? '',
      notes: meta,
    });
    return String(result.id);
  }, [cM]);

  const updateJob = useCallback(async (id: string, data: JobFormData, clientName: string, clientPhone: string, clientCuit: string, technicianNames: string[]) => {
    const totals = calculateJobTotals(data.laborCost, data.materialsCost, data.otherCosts, data.ivaRate);
    const existingJob = jobs.find(j => j.id === id);
    const statusMap: Record<string, string> = {
      'pending': 'pending', 'in_progress': 'in-progress', 'completed': 'completed',
      'invoiced': 'invoiced', 'paid': 'collected', 'cancelled': 'pending',
    };
    const meta = JSON.stringify({
      details: data.details, dueDate: data.dueDate, budgetStatus: data.budgetStatus,
      budgetDate: data.budgetDate, budgetSentDate: data.budgetSentDate ?? existingJob?.budgetSentDate,
      budgetWorksite: data.budgetWorksite, budgetDiscountType: data.budgetDiscountType,
      budgetDiscountValue: data.budgetDiscountValue, budgetPaymentTerms: data.budgetPaymentTerms,
      budgetDeliveryTerm: data.budgetDeliveryTerm, budgetWarranty: data.budgetWarranty,
      budgetConditions: data.budgetConditions,
      purchaseOrderDate: data.purchaseOrderDate,
      purchaseOrderFileUrl: data.purchaseOrderFileUrl,
      needsInvoice: data.needsInvoice, invoiceType: data.invoiceType,
      invoiceDate: data.invoiceDate, invoiceFileUrl: data.invoiceFileUrl,
      isConsumerFinal: data.isConsumerFinal,
      consumerFinalName: data.consumerFinalName, consumerFinalDni: data.consumerFinalDni,
      consumerFinalAddress: data.consumerFinalAddress,
      currency: data.currency ?? 'ARS',
      laborCost: data.laborCost, materialsCost: data.materialsCost, otherCosts: data.otherCosts,
      ivaRate: data.ivaRate, amountPaid: existingJob?.amountPaid ?? 0,
      productsUsed: data.productsUsed, userNotes: data.notes, invoiceNotes: data.invoiceNotes,
      createdBy: existingJob?.createdBy ?? '', createdByName: existingJob?.createdByName ?? '',
    });
    await uM.mutateAsync({
      id: parseInt(id), jobNumber: data.jobNumber, title: data.title, description: data.description,
      status: (statusMap[data.status] ?? 'pending') as any,
      customerId: data.clientId ? parseInt(data.clientId) : null,
      customerName: clientName, customerPhone: clientPhone, customerCuit: clientCuit,
      technicianIds: JSON.stringify(data.technicianIds),
      technicianNames: JSON.stringify(technicianNames),
      productIds: JSON.stringify(data.productsUsed.map((p: JobProduct) => p.productId)),
      budgetNumber: data.budgetNumber ?? '', budgetAmount: String(data.budgetAmount ?? 0),
      invoiceNumber: data.invoiceNumber ?? '', invoiceAmount: String(totals.totalAmount),
      purchaseOrder: data.hasPurchaseOrder ? (data.purchaseOrderNumber ?? 'SI') : '',
      paymentStatus: existingJob?.amountPaid && existingJob.amountPaid >= totals.totalAmount ? 'completed' : 'pending',
      startDate: data.startDate, endDate: data.endDate ?? '', notes: meta,
    });
  }, [uM, jobs]);

  const deleteJob = useCallback(async (id: string) => { await dM.mutateAsync({ id: parseInt(id) }); }, [dM]);
  const getJobById = useCallback((id: string) => jobs.find(j => j.id === id), [jobs]);
  const getJobsByStatus = useCallback((status: JobStatus) => jobs.filter(j => j.status === status), [jobs]);
  const getJobsByClient = useCallback((clientId: string) => jobs.filter(j => j.clientId === clientId), [jobs]);

  const getStats = useCallback(() => {
    const total = jobs.length;
    const pending = jobs.filter(j => j.status === 'pending').length;
    const inProgress = jobs.filter(j => j.status === 'in_progress').length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const invoiced = jobs.filter(j => j.status === 'invoiced').length;
    const paid = jobs.filter(j => j.status === 'paid').length;
    const totalBudgeted = jobs.reduce((s, j) => s + (j.budgetAmount ?? 0), 0);
    const totalInvoiced = jobs.filter(j => j.invoiceNumber).reduce((s, j) => s + j.totalAmount, 0);
    const totalCollected = jobs.reduce((s, j) => s + j.amountPaid, 0);
    const totalPending = jobs.filter(j => j.status !== 'paid' && j.status !== 'cancelled').reduce((s, j) => s + j.balanceDue, 0);
    const needsBudget = jobs.filter(j => j.budgetStatus === 'pending').length;
    const needsInvoice = jobs.filter(j => j.status === 'completed' && j.needsInvoice && !j.invoiceNumber).length;
    const needsCollection = jobs.filter(j => j.balanceDue > 0 && j.status !== 'cancelled').length;
    return { total, pending, inProgress, completed, invoiced, paid, totalBudgeted, totalInvoiced, totalCollected, totalPending, needsBudget, needsInvoice, needsCollection };
  }, [jobs]);

  return { jobs, addJob, updateJob, deleteJob, getJobById, getJobsByStatus, getJobsByClient, getStats };
}
