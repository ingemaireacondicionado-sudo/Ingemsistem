
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  DollarSign,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Send,
  RefreshCw,
  FileDown,
  Plus,
} from 'lucide-react';
import { generateBudgetPdf } from '@/lib/generateBudgetPdf';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Job } from '@/types/job';
import { formatCurrency, BUDGET_STATUS } from '@/types/job';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface BudgetTrackerProps {
  jobs: Job[];
  onStatusChange: (id: string, status: Job['status']) => void;
}

type SortField = 'budgetDate' | 'amount' | 'daysElapsed' | 'clientName';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'pending' | 'no_response' | 'rejected' | 'expired';

interface BudgetItem {
  job: Job;
  daysElapsed: number;
  isNoResponse: boolean;
  isExpired?: boolean;
}

export function BudgetTracker({ jobs, onStatusChange }: BudgetTrackerProps) {
  const navigate = useNavigate();
  const { canCreateEntity, canEditEntity } = useAuth();
  const canCreateBudgets = canCreateEntity('jobs');
  const canEditBudgets = canEditEntity('jobs');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('daysElapsed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [noResponseThreshold, setNoResponseThreshold] = useState(7);

  // Dialog state for actions
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    job: Job | null;
    action: 'approve' | 'reject' | 'followup' | null;
  }>({ open: false, job: null, action: null });
  const [followupNote, setFollowupNote] = useState('');

  // tRPC mutation for updating job meta
  const updateMutation = trpc.jobs.update.useMutation();
  const queryUtils = trpc.useUtils();

  // Get all jobs with pending or rejected budgets
  const budgetItems: BudgetItem[] = useMemo(() => {
    const now = new Date();

    return jobs
      .filter(j => {
        return (j.budgetStatus === 'pending' || j.budgetStatus === 'rejected') && j.status !== 'cancelled';
      })
      .map(j => {
        // Use budgetSentDate if available, otherwise budgetDate, otherwise startDate
        const referenceDate = j.budgetSentDate || j.budgetDate || j.startDate;
        const referenceDateObj = referenceDate ? new Date(referenceDate + 'T12:00:00') : new Date(j.createdAt);
        const diffMs = now.getTime() - referenceDateObj.getTime();
        const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        const isNoResponse = j.budgetStatus === 'pending' && Boolean(j.budgetSentDate) && daysElapsed > noResponseThreshold;

        // Check if expired: dueDate passed and still pending
        const isExpired = j.budgetStatus === 'pending' && Boolean(j.budgetSentDate) && j.dueDate
          ? now > new Date(j.dueDate + 'T23:59:59')
          : false;

        return { job: j, daysElapsed, isNoResponse, isExpired };
      });
  }, [jobs, noResponseThreshold]);

  const pendingItems = useMemo(() => budgetItems.filter(i => i.job.budgetStatus === 'pending'), [budgetItems]);
  const rejectedItems = useMemo(() => budgetItems.filter(i => i.job.budgetStatus === 'rejected'), [budgetItems]);
  const noResponseItems = useMemo(() => budgetItems.filter(i => i.isNoResponse), [budgetItems]);

  // Filter and sort
  const filteredItems = useMemo(() => {
    let items = budgetItems.filter(item => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          item.job.clientName.toLowerCase().includes(term) ||
          item.job.budgetNumber?.toLowerCase().includes(term) ||
          item.job.jobNumber.toLowerCase().includes(term) ||
          item.job.title.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }
      if (statusFilter === 'pending') return item.job.budgetStatus === 'pending' && !item.isExpired;
      if (statusFilter === 'no_response') return item.isNoResponse;
      if (statusFilter === 'rejected') return item.job.budgetStatus === 'rejected';
      if (statusFilter === 'expired') return !!item.isExpired;
      return true;
    });

    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'budgetDate':
          cmp = (a.job.budgetDate || a.job.createdAt).localeCompare(b.job.budgetDate || b.job.createdAt);
          break;
        case 'amount':
          cmp = (a.job.budgetAmount || a.job.totalAmount) - (b.job.budgetAmount || b.job.totalAmount);
          break;
        case 'daysElapsed':
          cmp = a.daysElapsed - b.daysElapsed;
          break;
        case 'clientName':
          cmp = a.job.clientName.localeCompare(b.job.clientName);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [budgetItems, searchTerm, statusFilter, sortField, sortDir]);

  // Group by client
  const groupedByClient = useMemo(() => {
    const groups: Record<string, {
      clientName: string;
      clientId: string;
      items: BudgetItem[];
      totalARS: number;
      totalUSD: number;
      noResponseCount: number;
      rejectedCount: number;
      pendingCount: number;
    }> = {};

    filteredItems.forEach(item => {
      const key = item.job.clientId || item.job.clientName;
      if (!groups[key]) {
        groups[key] = {
          clientName: item.job.clientName,
          clientId: item.job.clientId,
          items: [],
          totalARS: 0,
          totalUSD: 0,
          noResponseCount: 0,
          rejectedCount: 0,
          pendingCount: 0,
        };
      }
      groups[key].items.push(item);
      const amount = item.job.budgetAmount || item.job.totalAmount;
      if (item.job.currency === 'USD') {
        groups[key].totalUSD += amount;
      } else {
        groups[key].totalARS += amount;
      }
      if (item.isNoResponse) groups[key].noResponseCount++;
      if (item.job.budgetStatus === 'rejected') groups[key].rejectedCount++;
      if (item.job.budgetStatus === 'pending') groups[key].pendingCount++;
    });

    return Object.values(groups).sort((a, b) => {
      if (a.noResponseCount !== b.noResponseCount) return b.noResponseCount - a.noResponseCount;
      if (a.rejectedCount !== b.rejectedCount) return b.rejectedCount - a.rejectedCount;
      return b.totalARS - a.totalARS;
    });
  }, [filteredItems]);

  // Summary stats
  const stats = useMemo(() => {
    const totalARS = budgetItems.filter(i => i.job.currency !== 'USD').reduce((s, i) => s + (i.job.budgetAmount || i.job.totalAmount), 0);
    const totalUSD = budgetItems.filter(i => i.job.currency === 'USD').reduce((s, i) => s + (i.job.budgetAmount || i.job.totalAmount), 0);
    const pendingCount = pendingItems.length;
    const rejectedCount = rejectedItems.length;
    const noResponseCount = noResponseItems.length;
    const totalCount = budgetItems.length;
    const clientCount = new Set(budgetItems.map(i => i.job.clientId || i.job.clientName)).size;
    const avgDays = totalCount > 0 ? Math.round(budgetItems.reduce((s, i) => s + i.daysElapsed, 0) / totalCount) : 0;

    const decidedBudgetJobs = jobs.filter(j => j.budgetStatus === 'approved' || j.budgetStatus === 'rejected');
    const approvedJobs = decidedBudgetJobs.filter(j => j.budgetStatus === 'approved');
    const approvalRate = decidedBudgetJobs.length > 0 ? Math.round((approvedJobs.length / decidedBudgetJobs.length) * 100) : 0;

    return { totalARS, totalUSD, pendingCount, rejectedCount, noResponseCount, totalCount, clientCount, avgDays, approvalRate };
  }, [budgetItems, pendingItems, rejectedItems, noResponseItems, jobs]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Helper to update job meta (notes JSON field) with new budgetStatus or followup note
  const updateJobMeta = async (job: Job, updates: { budgetStatus?: string; appendNote?: string; newStatus?: string }) => {
    if (!canEditBudgets) {
      toast.error('No tenés permiso para modificar presupuestos');
      return false;
    }

    try {
      const existingNotes = job.notes || '';
      let userNotes = existingNotes;
      if (updates.appendNote) {
        const timestamp = new Date().toLocaleDateString('es-AR');
        const newNote = `[${timestamp}] Seguimiento: ${updates.appendNote}`;
        userNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;
      }

      const statusMap: Record<string, string> = {
        'pending': 'pending', 'in_progress': 'in-progress', 'completed': 'completed',
        'invoiced': 'invoiced', 'paid': 'collected', 'cancelled': 'pending',
      };

      const newJobStatus = updates.newStatus || job.status;
      const meta = JSON.stringify({
        details: job.details,
        dueDate: job.dueDate,
        budgetStatus: updates.budgetStatus || job.budgetStatus,
        budgetDate: job.budgetDate,
        budgetSentDate: job.budgetSentDate,
        budgetWorksite: job.budgetWorksite,
        budgetDiscountType: job.budgetDiscountType,
        budgetDiscountValue: job.budgetDiscountValue,
        budgetPaymentTerms: job.budgetPaymentTerms,
        budgetDeliveryTerm: job.budgetDeliveryTerm,
        budgetWarranty: job.budgetWarranty,
        budgetConditions: job.budgetConditions,
        purchaseOrderDate: job.purchaseOrderDate,
        purchaseOrderFileUrl: job.purchaseOrderFileUrl,
        needsInvoice: job.needsInvoice,
        invoiceType: job.invoiceType,
        invoiceDate: job.invoiceDate,
        invoiceFileUrl: job.invoiceFileUrl,
        isConsumerFinal: job.isConsumerFinal,
        consumerFinalName: job.consumerFinalName,
        consumerFinalDni: job.consumerFinalDni,
        consumerFinalAddress: job.consumerFinalAddress,
        currency: job.currency ?? 'ARS',
        laborCost: job.laborCost,
        materialsCost: job.materialsCost,
        otherCosts: job.otherCosts,
        ivaRate: job.ivaRate,
        amountPaid: job.amountPaid ?? 0,
        productsUsed: job.productsUsed,
        userNotes: userNotes,
        invoiceNotes: job.invoiceNotes,
        createdBy: job.createdBy ?? '',
        createdByName: job.createdByName ?? '',
      });

      await updateMutation.mutateAsync({
        id: parseInt(job.id),
        jobNumber: job.jobNumber,
        title: job.title,
        description: job.description,
        status: (statusMap[newJobStatus] ?? 'pending') as any,
        customerId: job.clientId ? parseInt(job.clientId) : null,
        customerName: job.clientName,
        customerPhone: job.clientPhone,
        customerCuit: job.clientCuit,
        technicianIds: JSON.stringify(job.technicianIds),
        technicianNames: JSON.stringify(job.technicianNames),
        productIds: JSON.stringify(job.productsUsed.map(p => p.productId)),
        budgetNumber: job.budgetNumber ?? '',
        budgetAmount: String(job.budgetAmount ?? 0),
        invoiceNumber: job.invoiceNumber ?? '',
        invoiceAmount: String(job.totalAmount),
        purchaseOrder: job.hasPurchaseOrder ? (job.purchaseOrderNumber ?? 'SI') : '',
        paymentStatus: job.amountPaid >= job.totalAmount ? 'completed' : 'pending',
        startDate: job.startDate,
        endDate: job.endDate ?? '',
        notes: meta,
      });

      await queryUtils.jobs.list.invalidate();
      return true;
    } catch (error) {
      console.error('Error updating job:', error);
      return false;
    }
  };

  const handleApprove = async (job: Job) => {
    const success = await updateJobMeta(job, { budgetStatus: 'approved', newStatus: 'pending' });
    if (success) {
      toast.success('Presupuesto aprobado', { description: `${job.title} - ${job.clientName}` });
    } else {
      toast.error('Error al aprobar presupuesto');
    }
    setActionDialog({ open: false, job: null, action: null });
  };

  const handleReject = async (job: Job) => {
    const success = await updateJobMeta(job, { budgetStatus: 'rejected' });
    if (success) {
      toast.success('Presupuesto rechazado', { description: `${job.title} - ${job.clientName}` });
    } else {
      toast.error('Error al rechazar presupuesto');
    }
    setActionDialog({ open: false, job: null, action: null });
  };

  const handleFollowup = async (job: Job) => {
    const note = followupNote.trim() || 'contacto realizado';
    const success = await updateJobMeta(job, { appendNote: note });
    if (success) {
      toast.success('Seguimiento registrado', { description: `${job.title} - ${job.clientName}` });
    } else {
      toast.error('Error al registrar seguimiento');
    }
    setFollowupNote('');
    setActionDialog({ open: false, job: null, action: null });
  };

  const openAction = (job: Job, action: 'approve' | 'reject' | 'followup') => {
    if (!canEditBudgets) {
      toast.error('No tenés permiso para modificar presupuestos');
      return;
    }
    setActionDialog({ open: true, job, action });
    setFollowupNote('');
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] md:space-y-5 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-3">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Send className="w-5 h-5 md:w-6 md:h-6 text-violet-600" />
            Presupuestos
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            {stats.totalCount} presupuesto{stats.totalCount !== 1 ? 's' : ''} pendiente{stats.totalCount !== 1 ? 's' : ''} de {stats.clientCount} cliente{stats.clientCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateBudgets && (
            <Button
              onClick={() => navigate('/presupuestos/nuevo')}
              className="min-h-11 touch-manipulation bg-violet-600 text-white hover:bg-violet-700 md:min-h-10"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" /> Nuevo Presupuesto
            </Button>
          )}
          <label className="text-xs md:text-sm text-slate-500 whitespace-nowrap">Sin respuesta:</label>
          <select
            value={noResponseThreshold}
            onChange={(e) => setNoResponseThreshold(Number(e.target.value))}
            className="px-2 md:px-3 py-1.5 md:py-2 border rounded-lg text-base md:text-sm bg-white min-h-11 md:min-h-[40px]"
          >
            <option value={3}>3 días</option>
            <option value={5}>5 días</option>
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={21}>21 días</option>
            <option value={30}>30 días</option>
          </select>
        </div>
      </div>

      {/* KPI Cards - 2 cols mobile, 4 cols tablet+ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
              <p className="text-xs md:text-xs text-amber-600 font-medium">Pendientes</p>
            </div>
            <p className="text-base md:text-2xl font-bold text-amber-700">{stats.pendingCount}</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${stats.noResponseCount > 0 ? 'border-l-red-500' : 'border-l-slate-400'}`}>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`w-4 h-4 md:w-5 md:h-5 ${stats.noResponseCount > 0 ? 'text-red-500' : 'text-slate-400'}`} />
              <p className={`text-xs md:text-xs font-medium ${stats.noResponseCount > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                Sin respuesta (+{noResponseThreshold}d)
              </p>
            </div>
            <p className={`text-base md:text-2xl font-bold ${stats.noResponseCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>
              {stats.noResponseCount}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-violet-500" />
              <p className="text-xs md:text-xs text-violet-600 font-medium">Total presupuestado</p>
            </div>
            {stats.totalARS > 0 && (
              <p className="text-sm md:text-lg font-bold text-violet-700">{formatCurrency(stats.totalARS, 'ARS')}</p>
            )}
            {stats.totalUSD > 0 && (
              <p className="text-sm md:text-lg font-bold text-violet-700">{formatCurrency(stats.totalUSD, 'USD')}</p>
            )}
            {stats.totalARS === 0 && stats.totalUSD === 0 && (
              <p className="text-sm md:text-lg font-bold text-violet-700">$0</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 mb-1">
              <ThumbsUp className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
              <p className="text-xs md:text-xs text-emerald-600 font-medium">Tasa aprobación</p>
            </div>
            <p className="text-base md:text-2xl font-bold text-emerald-700">{stats.approvalRate}%</p>
            <p className="text-xs md:text-xs text-slate-400">Prom: {stats.avgDays}d de espera</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters - stacked on mobile, row on tablet */}
      <div className="flex flex-col md:flex-row gap-2 md:gap-3">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar cliente, presupuesto, trabajo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 pl-9 text-base md:h-10 md:text-sm"
          />
        </div>
        <div className="flex gap-1.5 md:gap-2 overflow-x-auto md:overflow-visible">
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
            className="text-xs md:text-sm h-11 md:h-10 px-3 md:px-4 flex-shrink-0"
          >
            Todos ({stats.totalCount})
          </Button>
          <Button
            variant={statusFilter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('pending')}
            className={`text-xs md:text-sm h-11 md:h-10 px-3 md:px-4 flex-shrink-0 ${statusFilter !== 'pending' ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            Pendientes ({stats.pendingCount})
          </Button>
          <Button
            variant={statusFilter === 'no_response' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('no_response')}
            className={`text-xs md:text-sm h-11 md:h-10 px-3 md:px-4 flex-shrink-0 ${statusFilter !== 'no_response' ? 'text-red-600 border-red-200 hover:bg-red-50' : 'bg-red-600 hover:bg-red-700'}`}
          >
            Sin respuesta ({stats.noResponseCount})
          </Button>
          <Button
            variant={statusFilter === 'expired' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('expired')}
            className={`text-xs md:text-sm h-11 md:h-10 px-3 md:px-4 flex-shrink-0 ${statusFilter !== 'expired' ? 'text-orange-600 border-orange-200 hover:bg-orange-50' : 'bg-orange-600 hover:bg-orange-700'}`}
          >
            Vencidos ({budgetItems.filter(i => i.isExpired).length})
          </Button>
          <Button
            variant={statusFilter === 'rejected' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('rejected')}
            className={`text-xs md:text-sm h-11 md:h-10 px-3 md:px-4 flex-shrink-0 ${statusFilter !== 'rejected' ? 'text-slate-600 border-slate-200 hover:bg-slate-50' : 'bg-slate-600 hover:bg-slate-700'}`}
          >
            Rechazados ({stats.rejectedCount})
          </Button>
        </div>
      </div>

      {/* Sort buttons */}
      <div className="flex gap-1.5 md:gap-2 overflow-x-auto">
        <Button variant="ghost" size="sm" onClick={() => toggleSort('daysElapsed')} className="text-xs h-11 md:h-8 gap-1 flex-shrink-0 touch-manipulation">
          <ArrowUpDown className="w-3 h-3" /> Antigüedad
          {sortField === 'daysElapsed' && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toggleSort('amount')} className="text-xs h-11 md:h-8 gap-1 flex-shrink-0 touch-manipulation">
          <ArrowUpDown className="w-3 h-3" /> Monto
          {sortField === 'amount' && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toggleSort('clientName')} className="text-xs h-11 md:h-8 gap-1 flex-shrink-0 touch-manipulation">
          <ArrowUpDown className="w-3 h-3" /> Cliente
          {sortField === 'clientName' && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toggleSort('budgetDate')} className="text-xs h-11 md:h-8 gap-1 flex-shrink-0 touch-manipulation">
          <ArrowUpDown className="w-3 h-3" /> Fecha
          {sortField === 'budgetDate' && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
        </Button>
      </div>

      {/* Grouped by client */}
      {groupedByClient.length === 0 ? (
        <Card>
          <CardContent className="p-8 md:p-12 text-center">
            <CheckCircle2 className="w-12 h-12 md:w-16 md:h-16 text-emerald-400 mx-auto mb-3" />
            <p className="text-lg md:text-xl font-semibold text-slate-700">Sin presupuestos pendientes</p>
            <p className="text-sm md:text-base text-slate-500 mt-1">Todos los presupuestos están aprobados o no requieren seguimiento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {groupedByClient.map(group => {
            const isExpanded = expandedClient === group.clientName || groupedByClient.length <= 3;
            return (
              <Card key={group.clientName} className={`overflow-hidden ${group.noResponseCount > 0 ? 'border-red-200' : group.rejectedCount > 0 ? 'border-slate-300' : 'border-amber-200'}`}>
                {/* Client header */}
                <button
                  onClick={() => setExpandedClient(expandedClient === group.clientName ? null : group.clientName)}
                  className="w-full p-3 md:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <div className={`w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                      group.noResponseCount > 0 ? 'bg-red-100' : group.rejectedCount > 0 ? 'bg-slate-100' : 'bg-violet-100'
                    }`}>
                      <Building2 className={`w-4 h-4 md:w-5 md:h-5 ${
                        group.noResponseCount > 0 ? 'text-red-600' : group.rejectedCount > 0 ? 'text-slate-600' : 'text-violet-600'
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm md:text-base text-gray-900 truncate">{group.clientName}</p>
                      <div className="flex items-center gap-2 text-xs md:text-xs text-slate-500 flex-wrap">
                        <span>{group.items.length} presupuesto{group.items.length !== 1 ? 's' : ''}</span>
                        {group.pendingCount > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5">
                            {group.pendingCount} pendiente{group.pendingCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                        {group.noResponseCount > 0 && (
                          <Badge className="bg-red-100 text-red-700 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5">
                            {group.noResponseCount} sin respuesta
                          </Badge>
                        )}
                        {group.rejectedCount > 0 && (
                          <Badge className="bg-slate-200 text-slate-600 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5">
                            {group.rejectedCount} rechazado{group.rejectedCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                    <div className="text-right">
                      {group.totalARS > 0 && (
                        <p className={`text-sm md:text-base font-bold ${group.noResponseCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCurrency(group.totalARS, 'ARS')}
                        </p>
                      )}
                      {group.totalUSD > 0 && (
                        <p className={`text-sm md:text-base font-bold ${group.noResponseCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCurrency(group.totalUSD, 'USD')}
                        </p>
                      )}
                    </div>
                    {groupedByClient.length > 3 && (
                      isExpanded ? <ChevronUp className="w-4 h-4 md:w-5 md:h-5 text-slate-400" /> : <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Budget details */}
                {isExpanded && (
                  <div className="border-t">
                    {group.items.map(item => {
                      const budgetInfo = BUDGET_STATUS[item.job.budgetStatus] || { label: item.job.budgetStatus, color: 'bg-slate-100 text-slate-500' };
                      const amount = item.job.budgetAmount || item.job.totalAmount;
                      const isRejected = item.job.budgetStatus === 'rejected';

                      return (
                        <div
                          key={item.job.id}
                          className={`p-3 md:p-5 border-b last:border-b-0 ${
                            item.isNoResponse ? 'bg-red-50/50' : isRejected ? 'bg-slate-50/50' : 'bg-white'
                          }`}
                        >
                          {/* Tablet: horizontal layout with info left, amount+actions right */}
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
                            {/* Left: info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                                <span className="text-xs md:text-sm font-mono text-slate-500">#{item.job.jobNumber}</span>
                                {item.job.budgetNumber && (
                                  <span className="text-xs md:text-sm font-mono text-violet-600">{item.job.budgetNumber}</span>
                                )}
                                <Badge className={`text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5 ${budgetInfo.color}`}>
                                  {budgetInfo.label}
                                </Badge>
                                {item.isExpired && (
                                  <Badge className="bg-orange-100 text-orange-700 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5">
                                    Vencido
                                  </Badge>
                                )}
                                {item.isNoResponse && !item.isExpired && (
                                  <Badge className="bg-red-100 text-red-700 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5 animate-pulse">
                                    Sin respuesta ({item.daysElapsed}d)
                                  </Badge>
                                )}
                                {!item.job.budgetSentDate && !isRejected && (
                                  <Badge className="bg-sky-100 text-sky-700 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5">
                                    Aún no enviado
                                  </Badge>
                                )}
                                {item.job.budgetSentDate && !item.isNoResponse && !item.isExpired && !isRejected && (
                                  <Badge className="bg-amber-100 text-amber-700 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5">
                                    {item.daysElapsed}d de espera
                                  </Badge>
                                )}
                                {isRejected && (
                                  <Badge className="bg-slate-200 text-slate-600 text-xs md:text-xs px-1.5 md:px-2 py-0 md:py-0.5">
                                    Rechazado
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-sm text-gray-700 md:mt-1">{item.job.title}</p>
                              <div className="flex items-center gap-3 mt-1 md:mt-1.5 text-xs md:text-xs text-slate-500 flex-wrap">
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                  Enviado: {formatDate(item.job.budgetSentDate || item.job.budgetDate || item.job.startDate)}
                                </span>
                                {item.job.description && (
                                  <span className="truncate max-w-[200px] md:max-w-[300px]">{item.job.description}</span>
                                )}
                              </div>
                              {/* Last followup note */}
                              {item.job.notes && item.job.notes.includes('Seguimiento') && (
                                <div className="mt-1.5 md:mt-2 text-xs md:text-xs text-violet-600 bg-violet-50 px-2 md:px-3 py-1 md:py-1.5 rounded">
                                  <RefreshCw className="w-3 h-3 inline mr-1" />
                                  {item.job.notes.split('\n').filter((n: string) => n.includes('Seguimiento')).pop()}
                                </div>
                              )}
                              {/* Progress bar */}
                              <div className="mt-2 md:mt-3">
                                <div className="w-full h-1.5 md:h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      item.isNoResponse ? 'bg-red-500' : isRejected ? 'bg-slate-400' : 'bg-amber-400'
                                    }`}
                                    style={{ width: `${Math.min(100, (item.daysElapsed / Math.max(noResponseThreshold * 2, 1)) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Right: amount + actions */}
                            <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-2 md:gap-2.5 flex-shrink-0">
                              <p className={`text-sm md:text-lg font-bold ${item.isNoResponse ? 'text-red-700' : isRejected ? 'text-slate-500 line-through' : 'text-gray-900'}`}>
                                {formatCurrency(amount, item.job.currency)}
                              </p>
                              <div className="flex gap-1.5 md:gap-2 flex-wrap justify-end">
                                {canEditBudgets && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-11 md:h-9 px-2 md:px-3 min-w-[44px] touch-manipulation"
                                    onClick={() => navigate(
                                      item.job.budgetStatus === 'pending'
                                        ? `/presupuestos/${item.job.id}/editar`
                                        : `/jobs/${item.job.id}/edit`
                                    )}
                                  >
                                    <ExternalLink className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1" /> Editar
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-11 md:h-9 px-2 md:px-3 text-sky-600 border-sky-200 hover:bg-sky-50 min-w-[44px] touch-manipulation"
                                  onClick={() => {
                                    generateBudgetPdf(item.job)
                                      .then(() => toast.success('PDF generado', { description: `Presupuesto ${item.job.budgetNumber || item.job.jobNumber}` }))
                                      .catch(() => toast.error('Error al generar PDF'));
                                  }}
                                >
                                  <FileDown className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1" /> PDF
                                </Button>
                                {canEditBudgets && !isRejected && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="text-xs h-11 md:h-9 px-2 md:px-3 bg-emerald-600 hover:bg-emerald-700 min-w-[44px] touch-manipulation"
                                      onClick={() => openAction(item.job, 'approve')}
                                    >
                                      <ThumbsUp className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1" /> Aprobar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-xs h-11 md:h-9 px-2 md:px-3 text-red-600 border-red-200 hover:bg-red-50 min-w-[44px] touch-manipulation"
                                      onClick={() => openAction(item.job, 'reject')}
                                    >
                                      <ThumbsDown className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1" /> Rechazar
                                    </Button>
                                  </>
                                )}
                                {canEditBudgets && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-11 md:h-9 px-2 md:px-3 text-violet-600 border-violet-200 hover:bg-violet-50 min-w-[44px] touch-manipulation"
                                    onClick={() => openAction(item.job, 'followup')}
                                  >
                                    <RefreshCw className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1" /> Seguimiento
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={actionDialog.open && canEditBudgets} onOpenChange={(open) => !open && setActionDialog({ open: false, job: null, action: null })}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg">
              {actionDialog.action === 'approve' && 'Aprobar Presupuesto'}
              {actionDialog.action === 'reject' && 'Rechazar Presupuesto'}
              {actionDialog.action === 'followup' && 'Registrar Seguimiento'}
            </DialogTitle>
          </DialogHeader>

          {actionDialog.job && (
            <div className="space-y-4">
              {/* Job summary */}
              <div className="bg-slate-50 rounded-lg p-3 md:p-4 space-y-1">
                <p className="text-sm md:text-base font-medium text-gray-900">{actionDialog.job.title}</p>
                <p className="text-xs md:text-sm text-slate-500">
                  {actionDialog.job.clientName} {actionDialog.job.budgetNumber ? `· ${actionDialog.job.budgetNumber}` : `· ${actionDialog.job.jobNumber}`}
                </p>
                <p className="text-base md:text-lg font-bold text-gray-900">
                  {formatCurrency(actionDialog.job.budgetAmount || actionDialog.job.totalAmount, actionDialog.job.currency)}
                </p>
              </div>

              {actionDialog.action === 'approve' && (
                <p className="text-sm md:text-base text-slate-600">
                  Al aprobar, el presupuesto se marca como <strong>aprobado</strong> y el trabajo queda listo para cargar la OC e iniciar.
                </p>
              )}

              {actionDialog.action === 'reject' && (
                <p className="text-sm md:text-base text-slate-600">
                  Al rechazar, el presupuesto se marca como <strong>rechazado</strong>.
                  Podés volver a cambiarlo después desde el formulario del trabajo.
                </p>
              )}

              {actionDialog.action === 'followup' && (
                <div className="space-y-2">
                  <p className="text-sm md:text-base text-slate-600">
                    Registrá que hiciste seguimiento con el cliente. Se agrega una nota al trabajo con la fecha.
                  </p>
                  <Input
                    placeholder="Nota del seguimiento (ej: llamé al cliente, envié mail...)"
                    value={followupNote}
                    onChange={(e) => setFollowupNote(e.target.value)}
                    className="text-sm md:text-base h-11 md:h-11"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              className="h-11 md:h-11 text-sm md:text-base"
              onClick={() => setActionDialog({ open: false, job: null, action: null })}
            >
              Cancelar
            </Button>
            {actionDialog.action === 'approve' && actionDialog.job && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 h-11 md:h-11 text-sm md:text-base"
                onClick={() => handleApprove(actionDialog.job!)}
                disabled={updateMutation.isPending}
              >
                <ThumbsUp className="w-4 h-4 mr-1.5" /> {updateMutation.isPending ? 'Aprobando...' : 'Aprobar'}
              </Button>
            )}
            {actionDialog.action === 'reject' && actionDialog.job && (
              <Button
                variant="destructive"
                className="h-11 md:h-11 text-sm md:text-base"
                onClick={() => handleReject(actionDialog.job!)}
                disabled={updateMutation.isPending}
              >
                <ThumbsDown className="w-4 h-4 mr-1.5" /> {updateMutation.isPending ? 'Rechazando...' : 'Rechazar'}
              </Button>
            )}
            {actionDialog.action === 'followup' && actionDialog.job && (
              <Button
                className="bg-violet-600 hover:bg-violet-700 h-11 md:h-11 text-sm md:text-base"
                onClick={() => handleFollowup(actionDialog.job!)}
                disabled={updateMutation.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> {updateMutation.isPending ? 'Registrando...' : 'Registrar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
