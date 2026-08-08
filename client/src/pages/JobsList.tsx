
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  FileText,
  MoreVertical,
  Receipt,
  Package,
  Wrench,
  EyeIcon,
  LayoutList,
  Kanban,
  Play,
  Phone,
  MessageCircle,
  AlertTriangle,
} from 'lucide-react';
import { JobsPipeline } from './JobsPipeline';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Job } from '@/types/job';
import type { Product } from '@/types/product';
import type { Transaction } from '@/types/transaction';
import { 
  JOB_STATUS, 
  INVOICE_TYPE_OPTIONS, 
  BUDGET_STATUS,
  formatCurrency,
} from '@/types/job';
import { useAuth } from '@/contexts/AuthContext';
import { parseLocalDate } from '@/lib/dateUtils';
import { normalize } from '@/lib/textUtils';
import { calculateJobMargin, formatMarginChip, getMarginColor } from '@/lib/marginUtils';
import { whatsappUrl } from '@/lib/contactUtils';

interface JobsListProps {
  jobs: Job[];
  products?: Product[];
  transactions?: Transaction[];
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: Job['status']) => void;
}

type JobsActiveView = 'all' | 'pending' | 'finalized' | 'completed' | 'invoiced' | 'to_invoice' | 'to_budget' | 'pending_payment' | 'paid';
type JobsFilterStatus = Job['status'] | 'all';

export function JobsList({ jobs, products = [], transactions = [], onDelete, onStatusChange }: JobsListProps) {
  const navigate = useNavigate();
  const { userRole, canCreateEntity } = useAuth();
  const isAdmin = userRole === 'admin';
  const isViewer = userRole === 'viewer';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<JobsFilterStatus>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<JobsActiveView>('all');
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list');

  // Filtrar trabajos según la vista seleccionada
  const filteredJobs = useMemo(() => {
    const normalizedSearch = normalize(searchTerm.trim());

    return jobs.filter((job) => {
      const matchesSearch =
        normalizedSearch === '' ||
        [
          job.jobNumber,
          job.title,
          job.clientName,
          job.clientPhone,
          job.budgetNumber,
          job.invoiceNumber,
        ].some(value => normalize(value || '').includes(normalizedSearch));

      const matchesStatus = filterStatus === 'all' || job.status === filterStatus;

      let matchesView = true;
      switch (activeView) {
        case 'pending':
          matchesView = job.status === 'pending' || job.status === 'in_progress';
          break;
        case 'finalized':
          matchesView = ['completed', 'invoiced', 'paid'].includes(job.status);
          break;
        case 'completed':
          matchesView = job.status === 'completed';
          break;
        case 'invoiced':
          matchesView = job.status === 'invoiced';
          break;
        case 'to_invoice':
          matchesView = job.status === 'completed' && job.needsInvoice && !job.invoiceNumber;
          break;
        case 'to_budget':
          matchesView = job.budgetStatus === 'pending';
          break;
        case 'pending_payment':
          matchesView = job.balanceDue > 0 && job.status !== 'pending' && job.status !== 'cancelled';
          break;
        case 'paid':
          matchesView = job.status === 'paid';
          break;
        default:
          matchesView = true;
      }

      return matchesSearch && matchesStatus && matchesView;
    }).sort((a, b) => parseLocalDate(b.createdAt).getTime() - parseLocalDate(a.createdAt).getTime());
  }, [jobs, searchTerm, filterStatus, activeView]);

  // Estadísticas para los botones de vista rápida
  const stats = useMemo(() => {
    const toInvoice = jobs.filter(j => 
      j.status === 'completed' && j.needsInvoice && !j.invoiceNumber
    );
    const toBudget = jobs.filter(j => 
      j.budgetStatus === 'pending'
    );
    const pendingPayment = jobs.filter(j => 
      j.balanceDue > 0 && j.status !== 'pending' && j.status !== 'cancelled'
    );
    
    const finalized = jobs.filter(j => ['completed', 'invoiced', 'paid'].includes(j.status));
    const invoiced = jobs.filter(j => j.status === 'invoiced');
    const totalsByCurrency = (items: Job[], field: 'totalAmount' | 'balanceDue') => items.reduce(
      (totals, job) => {
        const amount = Number.isFinite(job[field]) ? job[field] : 0;
        if (job.currency === 'USD') totals.usd += amount;
        else totals.ars += amount;
        return totals;
      },
      { ars: 0, usd: 0 }
    );
    
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending' || j.status === 'in_progress').length,
      finalizedCount: finalized.length,
      completed: jobs.filter(j => j.status === 'completed').length,
      toInvoiceCount: toInvoice.length,
      toInvoiceTotals: totalsByCurrency(toInvoice, 'totalAmount'),
      toBudgetCount: toBudget.length,
      invoicedCount: invoiced.length,
      invoicedTotals: totalsByCurrency(invoiced, 'totalAmount'),
      pendingPaymentCount: pendingPayment.length,
      pendingPaymentTotals: totalsByCurrency(pendingPayment, 'balanceDue'),
      paid: jobs.filter(j => j.status === 'paid').length,
    };
  }, [jobs]);

  const handleDelete = () => {
    if (selectedJob) {
      onDelete(selectedJob.id);
      setDeleteDialogOpen(false);
      setDetailDialogOpen(false);
      setSelectedJob(null);
    }
  };

  const getStatusColor = (status: Job['status']) => {
    return (JOB_STATUS[status as keyof typeof JOB_STATUS] ?? JOB_STATUS.pending).color;
  };

  const getInvoiceBadge = (job: Job) => {
    if (!job.needsInvoice) return <span className="text-slate-400 text-xs">-</span>;
    if (job.invoiceNumber) {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 text-xs">
          {job.invoiceType} {job.invoiceNumber}
        </Badge>
      );
    }
    if (job.status === 'completed') {
      return (
        <Badge className="bg-red-100 text-red-700 text-xs animate-pulse">
          <AlertTriangle className="w-3 h-3 mr-1" />
          POR FACTURAR
        </Badge>
      );
    }
    return <Badge className="bg-amber-100 text-amber-700 text-xs">Pendiente</Badge>;
  };

  const getBudgetBadge = (job: Job) => {
    if (job.budgetStatus === 'not_needed') return <span className="text-slate-400 text-xs">-</span>;
    if (job.budgetStatus === 'pending') {
      return (
        <Badge className="bg-red-100 text-red-700 text-xs animate-pulse">
          <AlertTriangle className="w-3 h-3 mr-1" />
          POR PRESUPUESTAR
        </Badge>
      );
    }
    if (job.budgetStatus === 'approved') {
      return <Badge className="bg-emerald-100 text-emerald-700 text-xs">{job.budgetNumber}</Badge>;
    }
    const budgetStatus = BUDGET_STATUS[job.budgetStatus as keyof typeof BUDGET_STATUS] ?? BUDGET_STATUS.not_needed;
    return <Badge className={budgetStatus.color}>{budgetStatus.label}</Badge>;
  };

  // Días desde la creación (para detectar trabajos estancados)
  const daysSince = (iso: string) => {
    const createdAt = parseLocalDate(iso).getTime();
    if (Number.isNaN(createdAt)) return 0;
    return Math.max(0, Math.floor((Date.now() - createdAt) / 86400000));
  };

  const getAgeChip = (job: Job) => {
    if (job.status !== 'pending' && job.status !== 'in_progress') return null;
    const d = daysSince(job.createdAt);
    if (d < 3) return null;
    const cls = d >= 14 ? 'bg-red-100 text-red-700' : d >= 7 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
    return (
      <Badge className={`${cls} text-xs px-1.5 py-0`}>
        <Clock className="w-2.5 h-2.5 mr-0.5" />
        hace {d}d
      </Badge>
    );
  };

  // Siguiente paso lógico del trabajo, para avanzar sin abrir el formulario
  const getNextAction = (job: Job) => {
    if (isViewer) return null;
    if (job.status === 'pending') {
      return {
        label: 'Iniciar trabajo',
        icon: <Play className="w-3.5 h-3.5 mr-1" />,
        onClick: () => onStatusChange(job.id, 'in_progress'),
        className: 'bg-sky-600 hover:bg-sky-700',
      };
    }
    if (job.status === 'in_progress') {
      return {
        label: 'Marcar completado',
        icon: <CheckCircle className="w-3.5 h-3.5 mr-1" />,
        onClick: () => onStatusChange(job.id, 'completed'),
        className: 'bg-emerald-600 hover:bg-emerald-700',
      };
    }
    if (job.status === 'completed' && job.needsInvoice && !job.invoiceNumber) {
      return {
        label: 'Cargar factura',
        icon: <Receipt className="w-3.5 h-3.5 mr-1" />,
        onClick: () => navigate(`/jobs/${job.id}/edit`),
        className: 'bg-purple-600 hover:bg-purple-700',
      };
    }
    if (job.balanceDue > 0 && (job.status === 'invoiced' || (job.status === 'completed' && (!job.needsInvoice || !!job.invoiceNumber)))) {
      return {
        label: 'Ir a Cobranzas',
        icon: <Receipt className="w-3.5 h-3.5 mr-1" />,
        onClick: () => navigate('/cobranzas'),
        className: 'bg-red-600 hover:bg-red-700',
      };
    }
    return null;
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-4 lg:pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-1.5">
            Trabajos
            {isViewer && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">
                <EyeIcon className="w-3 h-3 mr-0.5" />
                Solo lectura
              </Badge>
            )}
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm">{stats.total} trabajos registrados</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* View mode toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              type="button"
              aria-label="Vista de lista"
              onClick={() => setViewMode('list')}
              className={`min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 p-1.5 sm:p-2 rounded-md transition-all touch-manipulation ${
                viewMode === 'list' ? 'bg-white shadow-sm text-sky-600' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Vista Lista"
            >
              <LayoutList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              aria-label="Vista de pipeline"
              onClick={() => setViewMode('pipeline')}
              className={`min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 p-1.5 sm:p-2 rounded-md transition-all touch-manipulation ${
                viewMode === 'pipeline' ? 'bg-white shadow-sm text-sky-600' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Vista Pipeline"
            >
              <Kanban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
          {!isViewer && canCreateEntity('jobs') && (
            <Button 
              className="bg-sky-600 hover:bg-sky-700 h-11 sm:h-9 text-sm px-2.5 sm:px-4 touch-manipulation"
              onClick={() => navigate('/jobs/new')}
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Nuevo Trabajo</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline View */}
      {viewMode === 'pipeline' && (
        <JobsPipeline jobs={jobs} onStatusChange={isViewer ? () => undefined : onStatusChange} />
      )}

      {/* Vistas Rápidas - Compact on mobile (only in list view) */}
      {viewMode === 'list' && (<>
      {/* Vistas Rápidas */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 sm:grid sm:grid-cols-4 lg:grid-cols-8 mobile-scroll-x">
        <button
          onClick={() => setActiveView('all')}
          className={`min-h-11 min-w-[104px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'all' ? 'bg-sky-50 border-sky-500 ring-1 ring-sky-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-slate-500">Todos</p>
          <p className="text-sm sm:text-xl font-bold">{stats.total}</p>
        </button>
        
        <button
          onClick={() => setActiveView('pending')}
          className={`min-h-11 min-w-[112px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'pending' ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-amber-600">Pendientes</p>
          <p className="text-sm sm:text-xl font-bold text-amber-700">{stats.pending}</p>
        </button>

        <button
          onClick={() => setActiveView('finalized')}
          className={`min-h-11 min-w-[112px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'finalized' ? 'bg-teal-50 border-teal-500 ring-1 ring-teal-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-teal-600">Finalizados</p>
          <p className="text-sm sm:text-xl font-bold text-teal-700">{stats.finalizedCount}</p>
        </button>
        
        <button
          onClick={() => setActiveView('to_budget')}
          className={`min-h-11 min-w-[120px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'to_budget' ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-orange-600">Presupuestar</p>
          <p className="text-sm sm:text-xl font-bold text-orange-700">{stats.toBudgetCount}</p>
        </button>
        
        <button
          onClick={() => setActiveView('to_invoice')}
          className={`min-h-11 min-w-[112px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'to_invoice' ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-purple-600">Facturar</p>
          <p className="text-sm sm:text-xl font-bold text-purple-700">{stats.toInvoiceCount}</p>
          {stats.toInvoiceTotals.ars > 0 && <p className="text-xs text-purple-500 truncate">{formatCurrency(stats.toInvoiceTotals.ars, 'ARS')}</p>}
          {stats.toInvoiceTotals.usd > 0 && <p className="text-xs text-purple-500 truncate">{formatCurrency(stats.toInvoiceTotals.usd, 'USD')}</p>}
        </button>

        <button
          onClick={() => setActiveView('invoiced')}
          className={`min-h-11 min-w-[112px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'invoiced' ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-indigo-600">Facturado</p>
          <p className="text-sm sm:text-xl font-bold text-indigo-700">{stats.invoicedCount}</p>
          {stats.invoicedTotals.ars > 0 && <p className="text-xs text-indigo-500 truncate">{formatCurrency(stats.invoicedTotals.ars, 'ARS')}</p>}
          {stats.invoicedTotals.usd > 0 && <p className="text-xs text-indigo-500 truncate">{formatCurrency(stats.invoicedTotals.usd, 'USD')}</p>}
        </button>
        
        <button
          onClick={() => setActiveView('pending_payment')}
          className={`min-h-11 min-w-[112px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'pending_payment' ? 'bg-red-50 border-red-500 ring-1 ring-red-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-red-600">Cobrar</p>
          <p className="text-sm sm:text-xl font-bold text-red-700">{stats.pendingPaymentCount}</p>
          {stats.pendingPaymentTotals.ars > 0 && <p className="text-xs text-red-500 truncate">{formatCurrency(stats.pendingPaymentTotals.ars, 'ARS')}</p>}
          {stats.pendingPaymentTotals.usd > 0 && <p className="text-xs text-red-500 truncate">{formatCurrency(stats.pendingPaymentTotals.usd, 'USD')}</p>}
        </button>

        <button
          onClick={() => setActiveView('paid')}
          className={`min-h-11 min-w-[104px] flex-shrink-0 touch-manipulation rounded-lg border p-2.5 text-left transition-all sm:min-w-0 sm:p-3 ${
            activeView === 'paid' ? 'bg-green-50 border-green-500 ring-1 ring-green-500' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <p className="text-xs text-green-600">Cobrado</p>
          <p className="text-sm sm:text-xl font-bold text-green-700">{stats.paid}</p>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 pl-9 text-base sm:h-9 sm:pl-10 sm:text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as JobsFilterStatus)}
          className="min-h-11 rounded-lg border px-3 py-2 text-base sm:min-h-9 sm:text-sm"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(JOB_STATUS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Desktop Table - Hidden on mobile */}
      <Card className="hidden md:block min-h-0 py-0 gap-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100 border-b">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">N° Trabajo</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Cliente</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Título</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Presup.</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">OC</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Factura</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Total</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Acc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredJobs.map((job) => (
                  <tr 
                    key={job.id} 
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => { setSelectedJob(job); setDetailDialogOpen(true); }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-medium text-sky-600">{job.jobNumber}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge className={`${getStatusColor(job.status)} text-xs`}>
                        {(JOB_STATUS[job.status as keyof typeof JOB_STATUS] ?? JOB_STATUS.pending).label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className="text-xs font-medium text-slate-800">{job.clientName}</p>
                      <p className="text-xs text-slate-500">{job.clientPhone}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs text-slate-800 max-w-xs truncate" title={job.title}>{job.title}</p>
                      {job.technicianNames.length > 0 && (
                        <p className="text-xs text-slate-500 flex items-center gap-0.5">
                          <Wrench className="w-2.5 h-2.5" />
                          {job.technicianNames.join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {getBudgetBadge(job)}
                      {job.budgetAmount && job.budgetStatus === 'approved' && (
                        <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(job.budgetAmount, job.currency)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {job.hasPurchaseOrder ? (
                        job.purchaseOrderNumber ? (
                          <Badge variant="outline" className="text-emerald-600 text-xs">
                            <Package className="w-2.5 h-2.5 mr-0.5" />
                            {job.purchaseOrderNumber}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 text-xs">Pend. OC</Badge>
                        )
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {getInvoiceBadge(job)}
                      {job.isConsumerFinal && (
                        <p className="text-xs text-slate-500 mt-0.5">CF: {job.consumerFinalName}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <p className="text-xs font-semibold text-slate-800">{formatCurrency(job.totalAmount, job.currency)}</p>
                      {job.balanceDue > 0 && job.balanceDue !== job.totalAmount && (
                        <p className="text-xs text-red-600">Saldo: {formatCurrency(job.balanceDue, job.currency)}</p>
                      )}
                      {job.status === 'paid' && (
                        <p className="text-xs text-emerald-600">Pagado</p>
                      )}
                      {isAdmin && job.subtotal > 0 && (() => {
                        const margin = calculateJobMargin(job, products, transactions);
                        const chip = formatMarginChip(margin);
                        const color = getMarginColor(margin);
                        return <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mt-0.5 ${color}`}>{chip}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-center">
                      {!isViewer && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-7 sm:w-7 touch-manipulation" aria-label={`Acciones de ${job.title}`}>
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {job.status === 'pending' && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(job.id, 'in_progress'); }}>
                                <Clock className="w-4 h-4 mr-2" />
                                Iniciar Trabajo
                              </DropdownMenuItem>
                            )}
                            {job.status === 'in_progress' && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(job.id, 'completed'); }}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Completar
                              </DropdownMenuItem>
                            )}
                            {job.status === 'completed' && job.needsInvoice && !job.invoiceNumber && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}/edit`); }}>
                                <Receipt className="w-4 h-4 mr-2" />
                                Agregar Factura
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}/edit`); }}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={(e) => { e.stopPropagation(); setSelectedJob(job); setDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredJobs.length === 0 && (
            <div className="text-center py-8 sm:py-12">
              <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600 mb-2">
                {activeView === 'to_invoice' ? 'No hay trabajos por facturar' : 
                 activeView === 'to_budget' ? 'No hay trabajos por presupuestar' :
                 'No hay trabajos'}
              </h3>
              <p className="text-slate-500 mb-4">
                {activeView === 'to_invoice' ? 'Todos los trabajos completados ya están facturados' : 
                 activeView === 'to_budget' ? 'No hay trabajos pendientes de presupuesto' :
                 'Crea tu primer trabajo'}
              </p>
              {!isViewer && canCreateEntity('jobs') && (
                <Button onClick={() => navigate('/jobs/new')} className="bg-sky-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Trabajo
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile Cards - Hidden on desktop */}
      <div className="md:hidden space-y-2">
        {filteredJobs.map((job) => (
          <Card 
            key={job.id} 
            className="min-h-0 py-0 gap-0 w-full min-w-0 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => { setSelectedJob(job); setDetailDialogOpen(true); }}
          >
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-mono text-xs font-medium text-sky-600">{job.jobNumber}</span>
                    <Badge className={`${getStatusColor(job.status)} text-xs px-1.5 py-0`}>
                      {(JOB_STATUS[job.status as keyof typeof JOB_STATUS] ?? JOB_STATUS.pending).label}
                    </Badge>
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-800">{job.title}</p>
                  <p className="text-xs text-slate-600">{job.clientName}</p>
                  {job.technicianNames.length > 0 && (
                    <p className="text-xs text-slate-400 flex items-center gap-0.5 mt-0.5">
                      <Wrench className="w-2.5 h-2.5" />
                      {job.technicianNames.join(', ')}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(job.totalAmount, job.currency)}</p>
                  {job.balanceDue > 0 && job.balanceDue !== job.totalAmount && (
                    <p className="text-xs text-red-600">Saldo: {formatCurrency(job.balanceDue, job.currency)}</p>
                  )}
                  {job.status === 'paid' && (
                    <p className="text-xs text-emerald-600">Pagado</p>
                  )}
                  {isAdmin && job.subtotal > 0 && (() => {
                    const margin = calculateJobMargin(job, products, transactions);
                    const chip = formatMarginChip(margin);
                    const color = getMarginColor(margin);
                    return <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mt-0.5 ${color}`}>{chip}</span>;
                  })()}
                </div>
              </div>
              {/* Badges row */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {getAgeChip(job)}
                {getBudgetBadge(job)}
                {job.hasPurchaseOrder && (
                  job.purchaseOrderNumber ? (
                    <Badge variant="outline" className="text-emerald-600 text-xs px-1.5 py-0">
                      <Package className="w-2.5 h-2.5 mr-0.5" />
                      {job.purchaseOrderNumber}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0">Pend. OC</Badge>
                  )
                )}
                {getInvoiceBadge(job)}
              </div>
              {/* Acción rápida + WhatsApp */}
              {(() => {
                const na = getNextAction(job);
                const quick = na && (job.status === 'pending' || job.status === 'in_progress');
                if (!quick && !job.clientPhone) return null;
                return (
                  <div className="flex gap-1.5 mt-2">
                    {quick && (
                      <Button
                        size="sm"
                        className={`min-h-11 flex-1 touch-manipulation text-xs ${na!.className}`}
                        onClick={(e) => { e.stopPropagation(); na!.onClick(); }}
                      >
                        {na!.icon}
                        {na!.label}
                      </Button>
                    )}
                    {job.clientPhone && (
                      <a
                        href={whatsappUrl(job.clientPhone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={quick ? '' : 'ml-auto'}
                      >
                        <Button variant="outline" size="sm" className="h-11 w-11 touch-manipulation border-green-300 p-0 text-green-700 sm:h-8 sm:w-9">
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        ))}

        {filteredJobs.length === 0 && (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <h3 className="text-sm font-medium text-slate-600 mb-1.5">
              {activeView === 'to_invoice' ? 'No hay trabajos por facturar' : 
               activeView === 'to_budget' ? 'No hay trabajos por presupuestar' :
               'No hay trabajos'}
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              {activeView === 'to_invoice' ? 'Todos los trabajos completados ya están facturados' : 
               activeView === 'to_budget' ? 'No hay trabajos pendientes de presupuesto' :
               'Crea tu primer trabajo'}
            </p>
            {!isViewer && canCreateEntity('jobs') && (
              <Button size="sm" onClick={() => navigate('/jobs/new')} className="bg-sky-600 text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nuevo Trabajo
              </Button>
            )}
          </div>
        )}
      </div>
      </>)}

      {/* Modal de Detalle */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-2xl max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-sm sm:text-base">
              <span className="font-mono text-sky-600">{selectedJob?.jobNumber}</span>
              {selectedJob && (
                <Badge className={`${getStatusColor(selectedJob.status)} text-xs`}>
                  {(JOB_STATUS[selectedJob.status as keyof typeof JOB_STATUS] ?? JOB_STATUS.pending).label}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedJob?.title}
            </DialogDescription>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-3 sm:space-y-4">
              {/* Cliente */}
              <div className="bg-slate-50 p-2.5 sm:p-4 rounded-lg">
                <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-slate-500">Cliente</h4>
                <p className="font-medium text-xs sm:text-base">{selectedJob.clientName}</p>
                <p className="text-xs sm:text-sm text-slate-500">{selectedJob.clientPhone}</p>
                {selectedJob.clientPhone && (
                  <div className="flex gap-2 mt-2">
                    <a href={`tel:${selectedJob.clientPhone}`}>
                      <Button type="button" variant="outline" size="sm" className="h-10 text-sm touch-manipulation">
                        <Phone className="w-3.5 h-3.5 mr-1" /> Llamar
                      </Button>
                    </a>
                    <a href={whatsappUrl(selectedJob.clientPhone)} target="_blank" rel="noopener noreferrer">
                      <Button type="button" variant="outline" size="sm" className="h-10 text-sm text-green-700 border-green-300 hover:bg-green-50 touch-manipulation">
                        <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                      </Button>
                    </a>
                  </div>
                )}
                {selectedJob.isConsumerFinal && (
                  <div className="mt-1.5 text-xs sm:text-sm bg-white p-2 sm:p-3 rounded border">
                    <p className="font-medium text-slate-700">Consumidor Final:</p>
                    <p>{selectedJob.consumerFinalName}</p>
                    <p className="text-slate-500">DNI: {selectedJob.consumerFinalDni}</p>
                    <p className="text-slate-500">{selectedJob.consumerFinalAddress}</p>
                  </div>
                )}
              </div>

              {/* Descripción */}
              <div className="bg-slate-50 p-2.5 sm:p-4 rounded-lg">
                <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-slate-500">Descripción</h4>
                <p className="text-xs sm:text-sm">{selectedJob.description}</p>
                {selectedJob.details && (
                  <div className="mt-1.5">
                    <p className="text-xs text-slate-500 mb-0.5">Detalle técnico:</p>
                    <p className="text-xs sm:text-sm bg-white p-1.5 sm:p-2 rounded border">{selectedJob.details}</p>
                  </div>
                )}
              </div>

              {/* Presupuesto */}
              {selectedJob.budgetStatus !== 'not_needed' && (
                <div className="bg-orange-50 p-2.5 sm:p-4 rounded-lg border border-orange-200">
                  <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-orange-600">Presupuesto</h4>
                  <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div>
                      <span className="text-slate-500">Número:</span>
                      <p className="font-medium">{selectedJob.budgetNumber || 'Pendiente'}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Monto:</span>
                      <p className="font-medium">{selectedJob.budgetAmount ? formatCurrency(selectedJob.budgetAmount, selectedJob.currency) : '-'}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Estado:</span>
                      <Badge className={`${BUDGET_STATUS[selectedJob.budgetStatus].color} text-xs`}>
                        {BUDGET_STATUS[selectedJob.budgetStatus].label}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-slate-500">Fecha:</span>
                      <p>{selectedJob.budgetDate ? parseLocalDate(selectedJob.budgetDate).toLocaleDateString('es-AR') : '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Orden de Compra */}
              {selectedJob.hasPurchaseOrder && (
                <div className="bg-emerald-50 p-2.5 sm:p-4 rounded-lg border border-emerald-200">
                  <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-emerald-600">Orden de Compra</h4>
                  <p className="text-xs sm:text-sm">
                    <span className="text-slate-500">Número:</span>{' '}
                    <span className="font-medium">{selectedJob.purchaseOrderNumber || 'Pendiente'}</span>
                  </p>
                  {selectedJob.purchaseOrderDate && (
                    <p className="text-xs sm:text-sm">
                      <span className="text-slate-500">Fecha:</span>{' '}
                      {parseLocalDate(selectedJob.purchaseOrderDate).toLocaleDateString('es-AR')}
                    </p>
                  )}
                </div>
              )}

              {/* Facturación */}
              {selectedJob.needsInvoice && (
                <div className="bg-purple-50 p-2.5 sm:p-4 rounded-lg border border-purple-200">
                  <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-purple-600">Facturación</h4>
                  <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div>
                      <span className="text-slate-500">Tipo:</span>
                      <p className="font-medium">{INVOICE_TYPE_OPTIONS[selectedJob.invoiceType]?.label}</p>
                    </div>
                    {selectedJob.invoiceNumber && (
                      <>
                        <div>
                          <span className="text-slate-500">Número:</span>
                          <p className="font-medium">{selectedJob.invoiceNumber}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Fecha:</span>
                          <p>{selectedJob.invoiceDate ? parseLocalDate(selectedJob.invoiceDate).toLocaleDateString('es-AR') : '-'}</p>
                        </div>
                      </>
                    )}
                  </div>
                  {!selectedJob.invoiceNumber && selectedJob.status === 'completed' && (
                    <div className="mt-2 p-1.5 sm:p-2 bg-red-100 rounded text-red-700 text-xs sm:text-sm font-medium">
                      ESTE TRABAJO NECESITA SER FACTURADO
                    </div>
                  )}
                  {selectedJob.invoiceNotes && (
                    <div className="mt-1.5">
                      <span className="text-slate-500 text-xs">Notas para factura:</span>
                      <p className="text-xs sm:text-sm bg-white p-1.5 sm:p-2 rounded border mt-0.5">{selectedJob.invoiceNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Costos */}
              <div className="bg-slate-50 p-2.5 sm:p-4 rounded-lg">
                <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-slate-500">Costos</h4>
                <div className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mano de obra:</span>
                    <span>{formatCurrency(selectedJob.laborCost, selectedJob.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Materiales:</span>
                    <span>{formatCurrency(selectedJob.materialsCost, selectedJob.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Otros gastos:</span>
                    <span>{formatCurrency(selectedJob.otherCosts, selectedJob.currency)}</span>
                  </div>
                  {selectedJob.productsUsed.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Productos:</span>
                      <span>{formatCurrency(selectedJob.productsUsed.reduce((sum, p) => sum + p.totalPrice, 0), selectedJob.currency)}</span>
                    </div>
                  )}
                  <hr className="my-1.5" />
                  <div className="flex justify-between">
                    <span className="text-slate-500">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(selectedJob.subtotal, selectedJob.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IVA ({selectedJob.ivaRate}%):</span>
                    <span>{formatCurrency(selectedJob.ivaAmount, selectedJob.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm sm:text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-sky-600">{formatCurrency(selectedJob.totalAmount, selectedJob.currency)}</span>
                  </div>
                  {selectedJob.balanceDue > 0 && (
                    <div className="flex justify-between text-red-600 font-medium">
                      <span>Saldo pendiente:</span>
                      <span>{formatCurrency(selectedJob.balanceDue, selectedJob.currency)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Productos */}
              {selectedJob.productsUsed.length > 0 && (
                <div className="bg-slate-50 p-2.5 sm:p-4 rounded-lg">
                  <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-slate-500">Productos Utilizados</h4>
                  <div className="space-y-1">
                    {selectedJob.productsUsed.map((product, i) => (
                      <div key={i} className="flex justify-between text-xs sm:text-sm p-1.5 sm:p-2 bg-white rounded border">
                        <span>{product.productName} x{product.quantity}</span>
                        <span className="font-medium">{formatCurrency(product.totalPrice, selectedJob.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Técnicos */}
              {selectedJob.technicianNames.length > 0 && (
                <div className="bg-slate-50 p-2.5 sm:p-4 rounded-lg">
                  <h4 className="font-semibold mb-1.5 text-xs sm:text-sm uppercase text-slate-500">Técnicos</h4>
                  <div className="flex gap-1.5 flex-wrap">
                    {selectedJob.technicianNames.map((name, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        <Wrench className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5" />
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones */}
              {(() => {
                const na = getNextAction(selectedJob);
                if (!na) return null;
                return (
                  <Button
                    size="sm"
                    className={`w-full text-xs sm:text-sm ${na.className}`}
                    onClick={() => { na.onClick(); setDetailDialogOpen(false); }}
                  >
                    {na.icon}
                    {na.label}
                  </Button>
                );
              })()}
              {!isViewer && (
                <div className="flex gap-2 pt-1 sm:pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs sm:text-sm"
                    onClick={() => navigate(`/jobs/${selectedJob.id}/edit`)}
                  >
                    <Edit className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 text-xs sm:text-sm"
                    onClick={() => { setDetailDialogOpen(false); setDeleteDialogOpen(true); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Eliminar
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Eliminar */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">Eliminar Trabajo</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              ¿Estás seguro de eliminar el trabajo <strong>{selectedJob?.jobNumber}</strong>?
              <br />
              {selectedJob?.title}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
