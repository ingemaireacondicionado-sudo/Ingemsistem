
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  DollarSign,
  Calendar,
  FileText,
  MessageCircle,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Job } from '@/types/job';
import { formatCurrency } from '@/types/job';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { toLocalDateStr } from '@/lib/dateUtils';
import { whatsappUrl } from '@/lib/contactUtils';
import { useAuth } from '@/contexts/AuthContext';
import { PrivateFileLink } from '@/components/PrivateFileLink';

interface InvoiceTrackerProps {
  jobs: Job[];
  onStatusChange: (id: string, status: Job['status']) => void;
}

type SortField = 'invoiceDate' | 'amount' | 'daysElapsed' | 'clientName';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'overdue' | 'upcoming';

interface InvoiceItem {
  job: Job;
  daysElapsed: number;
  daysOverdue: number;
  estimatedPayDate: string;
  isOverdue: boolean;
  isUpcoming: boolean; // within 7 days of expected payment
}

// ---------- Helpers ----------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Mensaje de reclamo para UNA factura */
function buildClaimMessage(item: InvoiceItem): string {
  const j = item.job;
  const lines: string[] = [];
  lines.push(`Hola ${firstName(j.clientName)}! Te escribo de INGEM.`);
  lines.push('');
  const factRef = j.invoiceType && j.invoiceType !== 'none' && j.invoiceNumber
    ? `la factura ${j.invoiceType} ${j.invoiceNumber}`
    : `el trabajo #${j.jobNumber}`;
  lines.push(`Te recuerdo el pago pendiente de ${factRef} por ${formatCurrency(j.balanceDue, j.currency)}:`);
  lines.push(`📋 ${j.title}`);
  if (j.invoiceDate) {
    const overdueTxt = item.isOverdue ? ` — vencida hace ${item.daysOverdue} día${item.daysOverdue !== 1 ? 's' : ''}` : '';
    lines.push(`📅 Emitida el ${formatDate(j.invoiceDate)}${overdueTxt}`);
  }
  lines.push('');
  lines.push('¿Me confirmás cuándo podrías realizar el pago? Ante cualquier consulta quedo a disposición. ¡Gracias!');
  return lines.join('\n');
}

/** Mensaje de reclamo con TODAS las facturas pendientes de un cliente */
function buildClientClaimMessage(clientName: string, items: InvoiceItem[]): string {
  if (items.length === 1) return buildClaimMessage(items[0]);
  const lines: string[] = [];
  lines.push(`Hola ${firstName(clientName)}! Te escribo de INGEM.`);
  lines.push('');
  lines.push(`Te paso el detalle de los pagos pendientes a la fecha:`);
  items.forEach(item => {
    const j = item.job;
    const ref = j.invoiceType && j.invoiceType !== 'none' && j.invoiceNumber
      ? `Fact. ${j.invoiceType} ${j.invoiceNumber}`
      : `#${j.jobNumber}`;
    const estado = item.isOverdue ? ` (vencida ${item.daysOverdue}d)` : '';
    lines.push(`• ${ref} — ${formatCurrency(j.balanceDue, j.currency)}${estado}`);
  });
  const totalARS = items.filter(i => i.job.currency !== 'USD').reduce((s, i) => s + i.job.balanceDue, 0);
  const totalUSD = items.filter(i => i.job.currency === 'USD').reduce((s, i) => s + i.job.balanceDue, 0);
  const totalParts: string[] = [];
  if (totalARS > 0) totalParts.push(formatCurrency(totalARS, 'ARS'));
  if (totalUSD > 0) totalParts.push(formatCurrency(totalUSD, 'USD'));
  lines.push('');
  lines.push(`Total: ${totalParts.join(' + ')}`);
  lines.push('');
  lines.push('¿Me confirmás cuándo podrías realizar el pago? Ante cualquier consulta quedo a disposición. ¡Gracias!');
  return lines.join('\n');
}

/** Colores del badge de antigüedad según severidad */
function daysBadgeClass(item: InvoiceItem): string {
  if (item.isOverdue) {
    if (item.daysOverdue > 30) return 'bg-red-600 text-white';
    return 'bg-red-100 text-red-700';
  }
  if (item.isUpcoming) return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

// ---------- Componente ----------

export function InvoiceTracker({ jobs, onStatusChange: _onStatusChange }: InvoiceTrackerProps) {
  const navigate = useNavigate();
  const { canCreateEntity, canEditEntity } = useAuth();
  const canEditJobs = canEditEntity('jobs');
  const canRegisterPayments = canEditJobs && canCreateEntity('transactions');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('daysElapsed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [paymentDays, setPaymentDays] = useState(30);

  // Facturas emitidas con saldo pendiente
  const invoiceItems: InvoiceItem[] = useMemo(() => {
    const now = new Date();
    return jobs
      .filter(j => {
        const hasInvoice = j.invoiceNumber && j.invoiceNumber.trim() !== '';
        const notFullyPaid = j.status !== 'paid' && j.balanceDue > 0;
        return hasInvoice && notFullyPaid;
      })
      .map(j => {
        const invoiceDate = j.invoiceDate || j.endDate || j.startDate;
        const invDateObj = invoiceDate ? new Date(invoiceDate + 'T12:00:00') : new Date();
        const diffMs = now.getTime() - invDateObj.getTime();
        const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        const estPayDate = new Date(invDateObj);
        estPayDate.setDate(estPayDate.getDate() + paymentDays);
        const estimatedPayDate = `${estPayDate.getFullYear()}-${String(estPayDate.getMonth() + 1).padStart(2, '0')}-${String(estPayDate.getDate()).padStart(2, '0')}`;

        const isOverdue = daysElapsed > paymentDays;
        const daysOverdue = isOverdue ? daysElapsed - paymentDays : 0;
        const isUpcoming = !isOverdue && (paymentDays - daysElapsed) <= 7;

        return { job: j, daysElapsed, daysOverdue, estimatedPayDate, isOverdue, isUpcoming };
      });
  }, [jobs, paymentDays]);

  // Filtro + orden
  const filteredItems = useMemo(() => {
    const items = invoiceItems.filter(item => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          item.job.clientName.toLowerCase().includes(term) ||
          item.job.invoiceNumber?.toLowerCase().includes(term) ||
          item.job.jobNumber.toLowerCase().includes(term) ||
          item.job.title.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }
      if (statusFilter === 'overdue') return item.isOverdue;
      if (statusFilter === 'upcoming') return item.isUpcoming;
      return true;
    });

    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'invoiceDate':
          cmp = (a.job.invoiceDate || '').localeCompare(b.job.invoiceDate || '');
          break;
        case 'amount':
          cmp = a.job.balanceDue - b.job.balanceDue;
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
  }, [invoiceItems, searchTerm, statusFilter, sortField, sortDir]);

  // Agrupado por cliente
  const groupedByClient = useMemo(() => {
    const groups: Record<string, {
      key: string;
      clientName: string;
      clientId: string;
      clientPhone: string;
      items: InvoiceItem[];
      totalARS: number;
      totalUSD: number;
      overdueCount: number;
    }> = {};
    filteredItems.forEach(item => {
      const key = item.job.clientId || item.job.clientName;
      if (!groups[key]) {
        groups[key] = {
          key,
          clientName: item.job.clientName,
          clientId: item.job.clientId,
          clientPhone: item.job.clientPhone || '',
          items: [],
          totalARS: 0,
          totalUSD: 0,
          overdueCount: 0,
        };
      }
      groups[key].items.push(item);
      if (!groups[key].clientPhone && item.job.clientPhone) {
        groups[key].clientPhone = item.job.clientPhone;
      }
      if (item.job.currency === 'USD') {
        groups[key].totalUSD += item.job.balanceDue;
      } else {
        groups[key].totalARS += item.job.balanceDue;
      }
      if (item.isOverdue) groups[key].overdueCount++;
    });
    return Object.values(groups).sort((a, b) => {
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
      return b.totalARS - a.totalARS;
    });
  }, [filteredItems]);

  // KPIs + aging (sobre el total, sin filtros)
  const stats = useMemo(() => {
    const totalARS = invoiceItems.filter(i => i.job.currency !== 'USD').reduce((s, i) => s + i.job.balanceDue, 0);
    const totalUSD = invoiceItems.filter(i => i.job.currency === 'USD').reduce((s, i) => s + i.job.balanceDue, 0);
    const overdueARS = invoiceItems.filter(i => i.isOverdue && i.job.currency !== 'USD').reduce((s, i) => s + i.job.balanceDue, 0);
    const overdueUSD = invoiceItems.filter(i => i.isOverdue && i.job.currency === 'USD').reduce((s, i) => s + i.job.balanceDue, 0);
    const overdueCount = invoiceItems.filter(i => i.isOverdue).length;
    const upcomingCount = invoiceItems.filter(i => i.isUpcoming).length;
    const totalCount = invoiceItems.length;
    const clientCount = new Set(invoiceItems.map(i => i.job.clientId || i.job.clientName)).size;
    const avgDays = totalCount > 0 ? Math.round(invoiceItems.reduce((s, i) => s + i.daysElapsed, 0) / totalCount) : 0;
    // Aging por cantidad de facturas
    const aging = {
      b1: invoiceItems.filter(i => i.daysElapsed <= 30).length,
      b2: invoiceItems.filter(i => i.daysElapsed > 30 && i.daysElapsed <= 60).length,
      b3: invoiceItems.filter(i => i.daysElapsed > 60).length,
    };
    return { totalARS, totalUSD, overdueARS, overdueUSD, overdueCount, upcomingCount, totalCount, clientCount, avgDays, aging };
  }, [invoiceItems]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const setMobileSort = (value: string) => {
    const [field, direction] = value.split(':') as [SortField, SortDir];
    setSortField(field);
    setSortDir(direction);
  };

  const toggleFilter = (f: StatusFilter) => {
    setStatusFilter(prev => (prev === f ? 'all' : f));
  };

  const toggleClient = (key: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedClients(new Set());
      setAllExpanded(false);
    } else {
      setExpandedClients(new Set(groupedByClient.map(g => g.key)));
      setAllExpanded(true);
    }
  };

  // ---------- Registro de cobro ----------
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; job: Job | null }>({ open: false, job: null });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(toLocalDateStr(new Date()));
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const registerPaymentMutation = trpc.jobs.registerPayment.useMutation();
  const utils = trpc.useUtils();

  const openPaymentDialog = (job: Job) => {
    if (!canRegisterPayments) {
      toast.error('No tenés permiso para registrar cobros');
      return;
    }
    setPaymentDialog({ open: true, job });
    setPaymentAmount(String(job.balanceDue));
    setPaymentDate(toLocalDateStr(new Date()));
    setPaymentMethod('transfer');
    setPaymentNotes('');
  };

  const handleRegisterPayment = async () => {
    if (!canRegisterPayments) {
      toast.error('No tenés permiso para registrar cobros');
      return;
    }
    const amountValue = parseFloat(paymentAmount);
    if (!paymentDialog.job || !paymentAmount || !Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error('Ingresá un monto válido');
      return;
    }
    if (amountValue > paymentDialog.job.balanceDue) {
      toast.error(`El cobro no puede superar el saldo de ${formatCurrency(paymentDialog.job.balanceDue, paymentDialog.job.currency)}`);
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await registerPaymentMutation.mutateAsync({
        jobId: parseInt(paymentDialog.job.id),
        amount: paymentAmount,
        date: paymentDate,
        paymentMethod,
        notes: paymentNotes,
      });
      await utils.jobs.list.invalidate();
      await utils.transactions.list.invalidate();
      toast.success(
        result.isFullyPaid
          ? `Cobro total registrado - ${formatCurrency(parseFloat(paymentAmount), paymentDialog.job.currency)}. Ingreso creado en Finanzas.`
          : `Cobro parcial registrado - ${formatCurrency(parseFloat(paymentAmount), paymentDialog.job.currency)}. Saldo restante: ${formatCurrency(result.totalAmount - result.newAmountPaid, paymentDialog.job.currency)}`
      );
      setPaymentDialog({ open: false, job: null });
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar el cobro');
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedAmount = parseFloat(paymentAmount) || 0;

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-4 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
            Cobranzas Pendientes
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {stats.totalCount} factura{stats.totalCount !== 1 ? 's' : ''} pendiente{stats.totalCount !== 1 ? 's' : ''} de {stats.clientCount} cliente{stats.clientCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">Plazo cobro:</label>
        <select
          value={paymentDays}
          onChange={(e) => setPaymentDays(Number(e.target.value))}
          className="min-h-11 px-2 py-1 border rounded text-base sm:text-sm"
          >
            <option value={15}>15 días</option>
            <option value={30}>30 días</option>
            <option value={45}>45 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
          </select>
        </div>
      </div>

      {/* KPI Cards compactas en celular, tocables para filtrar */}
      <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Card
          onClick={() => toggleFilter('overdue')}
          className={`min-w-0 min-h-0 py-0 gap-0 border-l-4 border-l-red-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'overdue' ? 'ring-2 ring-red-400 shadow-md' : ''}`}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-xs text-red-600 font-medium">Vencidas</p>
              </div>
              {statusFilter === 'overdue' && <X className="w-3.5 h-3.5 text-red-400" />}
            </div>
            <p className="text-base sm:text-xl font-bold text-red-700">{stats.overdueCount}</p>
            {stats.overdueARS > 0 && (
              <p className="text-xs text-red-500">{formatCurrency(stats.overdueARS, 'ARS')}</p>
            )}
            {stats.overdueUSD > 0 && (
              <p className="text-xs text-red-500">{formatCurrency(stats.overdueUSD, 'USD')}</p>
            )}
          </CardContent>
        </Card>

        <Card
          onClick={() => toggleFilter('upcoming')}
          className={`min-w-0 min-h-0 py-0 gap-0 border-l-4 border-l-amber-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'upcoming' ? 'ring-2 ring-amber-400 shadow-md' : ''}`}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <p className="text-xs text-amber-600 font-medium">Por vencer (7d)</p>
              </div>
              {statusFilter === 'upcoming' && <X className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <p className="text-base sm:text-xl font-bold text-amber-700">{stats.upcomingCount}</p>
            <p className="text-xs text-slate-400">tocá para filtrar</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 min-w-0 min-h-0 py-0 gap-0 border-l-4 border-l-blue-500 sm:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-blue-600 font-medium">Total por cobrar</p>
            </div>
            {stats.totalARS > 0 && (
              <p className="text-sm sm:text-lg font-bold text-blue-700">{formatCurrency(stats.totalARS, 'ARS')}</p>
            )}
            {stats.totalUSD > 0 && (
              <p className="text-sm sm:text-lg font-bold text-blue-700">{formatCurrency(stats.totalUSD, 'USD')}</p>
            )}
            {stats.totalARS === 0 && stats.totalUSD === 0 && (
              <p className="text-sm sm:text-lg font-bold text-blue-700">$0</p>
            )}
          </CardContent>
        </Card>

        {/* Aging */}
        <Card className="hidden min-w-0 min-h-0 py-0 gap-0 border-l-4 border-l-slate-400 sm:flex">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-slate-600 font-medium">Antigüedad</p>
              <p className="text-xs text-slate-400">prom. {stats.avgDays}d</p>
            </div>
            {stats.totalCount > 0 ? (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                  {stats.aging.b1 > 0 && (
                    <div className="bg-emerald-400" style={{ width: `${(stats.aging.b1 / stats.totalCount) * 100}%` }} />
                  )}
                  {stats.aging.b2 > 0 && (
                    <div className="bg-amber-400" style={{ width: `${(stats.aging.b2 / stats.totalCount) * 100}%` }} />
                  )}
                  {stats.aging.b3 > 0 && (
                    <div className="bg-red-500" style={{ width: `${(stats.aging.b3 / stats.totalCount) * 100}%` }} />
                  )}
                </div>
                <div className="flex justify-between mt-1.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />0-30: {stats.aging.b1}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />31-60: {stats.aging.b2}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />+60: {stats.aging.b3}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">Sin facturas</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Búsqueda + orden + expandir */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Buscar cliente, factura, trabajo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-11 sm:h-9 text-base sm:text-sm"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:hidden">
          <select
            aria-label="Ordenar cobranzas"
            value={`${sortField}:${sortDir}`}
            onChange={(e) => setMobileSort(e.target.value)}
            className="h-11 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="daysElapsed:desc">Más antiguas primero</option>
            <option value="daysElapsed:asc">Más recientes primero</option>
            <option value="amount:desc">Mayor saldo primero</option>
            <option value="amount:asc">Menor saldo primero</option>
            <option value="clientName:asc">Cliente A-Z</option>
            <option value="clientName:desc">Cliente Z-A</option>
          </select>
          {groupedByClient.length > 1 && (
            <Button variant="outline" size="icon" onClick={toggleAll} className="h-11 w-11 touch-manipulation" aria-label={allExpanded ? 'Colapsar clientes' : 'Expandir clientes'}>
              {allExpanded ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
            </Button>
          )}
        </div>
        <div className="hidden gap-1.5 sm:flex">
          <Button variant="ghost" size="sm" onClick={() => toggleSort('daysElapsed')} className="text-xs h-11 sm:h-9 gap-1 flex-shrink-0 touch-manipulation">
            <ArrowUpDown className="w-3 h-3" /> Antigüedad
            {sortField === 'daysElapsed' && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toggleSort('amount')} className="text-xs h-11 sm:h-9 gap-1 flex-shrink-0 touch-manipulation">
            <ArrowUpDown className="w-3 h-3" /> Monto
            {sortField === 'amount' && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toggleSort('clientName')} className="text-xs h-11 sm:h-9 gap-1 flex-shrink-0 touch-manipulation">
            <ArrowUpDown className="w-3 h-3" /> Cliente
            {sortField === 'clientName' && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
          </Button>
          {groupedByClient.length > 1 && (
            <Button variant="outline" size="sm" onClick={toggleAll} className="text-xs h-11 sm:h-9 gap-1 flex-shrink-0 touch-manipulation">
              {allExpanded ? <ChevronsDownUp className="w-3 h-3" /> : <ChevronsUpDown className="w-3 h-3" />}
              {allExpanded ? 'Colapsar' : 'Expandir'}
            </Button>
          )}
        </div>
      </div>

      {/* Indicador de filtro activo */}
      {statusFilter !== 'all' && (
        <div className="flex items-center gap-2">
          <Badge
            className={`cursor-pointer ${statusFilter === 'overdue' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
            onClick={() => setStatusFilter('all')}
          >
            Mostrando: {statusFilter === 'overdue' ? 'Vencidas' : 'Por vencer'} <X className="w-3 h-3 ml-1 inline" />
          </Badge>
          <span className="text-xs text-slate-400">{filteredItems.length} resultado{filteredItems.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Agrupado por cliente */}
      {groupedByClient.length === 0 ? (
        <Card className="min-h-0 py-0 gap-0">
          <CardContent className="p-6 sm:p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-700">
              {statusFilter !== 'all' || searchTerm ? 'Sin resultados con este filtro' : 'Sin facturas pendientes'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {statusFilter !== 'all' || searchTerm ? 'Probá quitando filtros o búsqueda' : 'Todas las facturas emitidas están cobradas'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {groupedByClient.map(group => {
            const isExpanded = expandedClients.has(group.key);
            return (
              <Card key={group.key} className={`overflow-hidden w-full min-w-0 min-h-0 py-0 gap-0 ${group.overdueCount > 0 ? 'border-red-200' : ''}`}>
                {/* Encabezado del cliente */}
                <div
                  className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => toggleClient(group.key)}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs sm:text-sm font-bold ${group.overdueCount > 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {getInitials(group.clientName)}
                      {group.overdueCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm sm:text-base text-gray-900 truncate">{group.clientName}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{group.items.length} factura{group.items.length !== 1 ? 's' : ''}</span>
                        {group.overdueCount > 0 && (
                          <Badge className="bg-red-100 text-red-700 text-xs px-1.5 py-0">
                            {group.overdueCount} vencida{group.overdueCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      {/* Totales en celular: debajo del nombre */}
                      <div className="sm:hidden mt-0.5 flex items-baseline gap-2 flex-wrap">
                        {group.totalARS > 0 && (
                          <span className={`text-sm font-bold ${group.overdueCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                            {formatCurrency(group.totalARS, 'ARS')}
                          </span>
                        )}
                        {group.totalUSD > 0 && (
                          <span className={`text-sm font-bold ${group.overdueCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                            {formatCurrency(group.totalUSD, 'USD')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <div className="hidden sm:block text-right">
                      {group.totalARS > 0 && (
                        <p className={`text-base font-bold whitespace-nowrap ${group.overdueCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCurrency(group.totalARS, 'ARS')}
                        </p>
                      )}
                      {group.totalUSD > 0 && (
                        <p className={`text-base font-bold whitespace-nowrap ${group.overdueCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCurrency(group.totalUSD, 'USD')}
                        </p>
                      )}
                    </div>
                    {group.clientPhone && (
                      <a
                        href={whatsappUrl(group.clientPhone, buildClientClaimMessage(group.clientName, group.items))}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-11 w-11 flex-shrink-0 touch-manipulation items-center justify-center rounded-full bg-green-100 transition-colors hover:bg-green-200 sm:h-9 sm:w-9"
                        title="Reclamar por WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4 text-green-600" />
                      </a>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Detalle de facturas */}
                {isExpanded && (
                  <div className="border-t">
                    {group.items.map(item => {
                      const paidPct = item.job.totalAmount > 0
                        ? Math.min(100, Math.round((item.job.amountPaid / item.job.totalAmount) * 100))
                        : 0;
                      return (
                        <div
                          key={item.job.id}
                          className={`p-3 sm:p-4 border-b last:border-b-0 ${
                            item.isOverdue
                              ? 'bg-red-50/50 border-l-4 border-l-red-400'
                              : item.isUpcoming
                                ? 'bg-amber-50/30 border-l-4 border-l-amber-300'
                                : 'bg-white border-l-4 border-l-transparent'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-mono text-slate-500">#{item.job.jobNumber}</span>
                                <Badge className={`text-xs px-1.5 py-0 ${daysBadgeClass(item)}`}>
                                  {item.isOverdue
                                    ? `Vencida (${item.daysOverdue}d)`
                                    : item.isUpcoming
                                      ? `Vence en ${paymentDays - item.daysElapsed}d`
                                      : `${item.daysElapsed}d`}
                                </Badge>
                                {item.job.invoiceType && item.job.invoiceType !== 'none' && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                                    Fact. {item.job.invoiceType} {item.job.invoiceNumber}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-sm text-gray-700">{item.job.title}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-3 h-3" />
                                  Fact: {formatDate(item.job.invoiceDate)}
                                </span>
                                <span className="hidden min-[420px]:flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  Est. cobro: {formatDate(item.estimatedPayDate)}
                                </span>
                                {item.job.invoiceFileUrl && (
                                  <PrivateFileLink
                                    value={item.job.invoiceFileUrl}
                                    label="Ver PDF"
                                    className="flex items-center gap-0.5 text-emerald-600 hover:text-emerald-800 font-medium"
                                  />
                                )}
                              </div>
                              {/* Cobro parcial */}
                              {item.job.amountPaid > 0 && (
                                <div className="mt-1.5 max-w-[240px]">
                                  <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                                    <span>Cobrado {formatCurrency(item.job.amountPaid, item.job.currency)}</span>
                                    <span>{paidPct}%</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${paidPct}%` }} />
                                  </div>
                                </div>
                              )}
                            </div>
                            <p className={`flex-shrink-0 text-sm sm:text-base font-bold ${item.isOverdue ? 'text-red-700' : 'text-gray-900'}`}>
                              {formatCurrency(item.job.balanceDue, item.job.currency)}
                            </p>
                          </div>
                          {/* Acciones: fila completa en celular, alineadas a la derecha en desktop */}
                          <div className="mt-2 flex gap-1.5 sm:justify-end">
                            {item.job.clientPhone && (
                              <a
                                href={whatsappUrl(item.job.clientPhone, buildClaimMessage(item))}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 sm:flex-none"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full sm:w-auto text-xs h-11 sm:h-7 px-2 text-green-700 border-green-300 hover:bg-green-50"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 mr-1 sm:w-3 sm:h-3 sm:mr-0.5" /> Reclamar
                                </Button>
                              </a>
                            )}
                            {canEditJobs && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-none text-xs h-11 sm:h-7 px-3 sm:px-2"
                                onClick={() => navigate(`/jobs/${item.job.id}/edit`)}
                              >
                                <ExternalLink className="w-3.5 h-3.5 sm:w-3 sm:h-3 sm:mr-0.5" />
                                <span className="hidden sm:inline">Editar</span>
                              </Button>
                            )}
                            {canRegisterPayments && (
                              <Button
                                size="sm"
                                className="flex-1 sm:flex-none text-xs h-11 sm:h-7 px-2 bg-emerald-600 hover:bg-emerald-700"
                                onClick={(e) => { e.stopPropagation(); openPaymentDialog(item.job); }}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1 sm:w-3 sm:h-3 sm:mr-0.5" /> Cobro
                              </Button>
                            )}
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

      {/* Dialog de registro de cobro */}
      <Dialog open={paymentDialog.open && canRegisterPayments} onOpenChange={(open) => !open && setPaymentDialog({ open: false, job: null })}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Registrar Cobro
            </DialogTitle>
          </DialogHeader>
          {paymentDialog.job && (
            <div className="space-y-3 sm:space-y-4">
              {/* Resumen del trabajo */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Trabajo</span>
                  <span className="text-xs font-mono">#{paymentDialog.job.jobNumber}</span>
                </div>
                <p className="text-sm font-medium">{paymentDialog.job.title}</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">{paymentDialog.job.clientName}</span>
                  <span className="text-sm font-bold text-emerald-700">
                    Saldo: {formatCurrency(paymentDialog.job.balanceDue, paymentDialog.job.currency)}
                  </span>
                </div>
                {paymentDialog.job.invoiceNumber && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Factura</span>
                    <span className="text-xs">{paymentDialog.job.invoiceNumber}</span>
                  </div>
                )}
              </div>

              {/* Monto */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Monto cobrado</Label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(String(paymentDialog.job!.balanceDue))}
                      className="min-h-11 touch-manipulation rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 sm:min-h-9"
                    >
                      Total
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(String(Math.round(paymentDialog.job!.balanceDue / 2 * 100) / 100))}
                      className="min-h-11 touch-manipulation rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 sm:min-h-9"
                    >
                      50%
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                    {paymentDialog.job.currency === 'USD' ? 'US$' : '$'}
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    max={paymentDialog.job.balanceDue}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="h-11 pl-10 text-base sm:h-10 sm:text-sm"
                    placeholder="0.00"
                  />
                </div>
                {parsedAmount > 0 && parsedAmount < paymentDialog.job.balanceDue && (
                  <p className="text-xs text-amber-600">
                    Cobro parcial. Quedará un saldo de {formatCurrency(paymentDialog.job.balanceDue - parsedAmount, paymentDialog.job.currency)}
                  </p>
                )}
              </div>

              {/* Fecha */}
              <div className="space-y-1.5">
                <Label className="text-sm">Fecha de cobro</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              {/* Medio de pago */}
              <div className="space-y-1.5">
                <Label className="text-sm">Medio de pago</Label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base sm:hidden"
                >
                  <option value="transfer">Transferencia</option>
                  <option value="cash">Efectivo</option>
                  <option value="check">Cheque</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
                <div className="hidden grid-cols-3 gap-1.5 sm:grid">
                  {[
                    { value: 'transfer', label: 'Transferencia' },
                    { value: 'cash', label: 'Efectivo' },
                    { value: 'check', label: 'Cheque' },
                    { value: 'card', label: 'Tarjeta' },
                    { value: 'other', label: 'Otro' },
                  ].map(m => (
                    <Button
                      key={m.value}
                      type="button"
                      variant={paymentMethod === m.value ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => setPaymentMethod(m.value)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div className="space-y-1.5">
                <Label className="text-sm">Notas (opcional)</Label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ej: Transferencia recibida, cheque N°..."
                />
              </div>
            </div>
          )}
          <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 mt-3 flex-row gap-2 border-t bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:mb-0 sm:mt-0 sm:p-0">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => setPaymentDialog({ open: false, job: null })}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 sm:flex-none"
              onClick={handleRegisterPayment}
              disabled={!canRegisterPayments || isSubmitting || !paymentAmount || parsedAmount <= 0 || parsedAmount > (paymentDialog.job?.balanceDue || 0)}
            >
              {isSubmitting ? 'Registrando...' : 'Confirmar Cobro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
