
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Package,
  PlayCircle,
  Wrench,
  Receipt,
  DollarSign,
  ChevronRight,
  Clock,
  CheckCircle,
  Edit,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Job } from '@/types/job';
import {
  JOB_STATUS,
  formatCurrency,
} from '@/types/job';
import { useAuth } from '@/contexts/AuthContext';

export type PipelineStage = 
  | 'budget_pending'
  | 'oc_pending'
  | 'oc_not_started'
  | 'in_progress'
  | 'invoice_pending'
  | 'collection_pending';

interface StageConfig {
  id: PipelineStage;
  label: string;
  shortLabel: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  description: string;
}

const STAGES: StageConfig[] = [
  {
    id: 'budget_pending',
    label: 'Presupuestos Pendientes',
    shortLabel: 'Presup.',
    icon: FileText,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    textColor: 'text-orange-700',
    description: 'Presupuestos enviados sin aprobar',
  },
  {
    id: 'oc_pending',
    label: 'OC Pendientes',
    shortLabel: 'OC Pend.',
    icon: Package,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-700',
    description: 'Presupuesto aprobado, falta OC',
  },
  {
    id: 'oc_not_started',
    label: 'Listos para Iniciar',
    shortLabel: 'Sin Iniciar',
    icon: PlayCircle,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-300',
    textColor: 'text-sky-700',
    description: 'Trabajos habilitados que todavía no comenzaron',
  },
  {
    id: 'in_progress',
    label: 'En Ejecución',
    shortLabel: 'Ejecutando',
    icon: Wrench,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    textColor: 'text-blue-700',
    description: 'Trabajos en progreso',
  },
  {
    id: 'invoice_pending',
    label: 'Facturación Pendiente',
    shortLabel: 'Facturar',
    icon: Receipt,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    textColor: 'text-purple-700',
    description: 'Completados sin factura',
  },
  {
    id: 'collection_pending',
    label: 'Cobro Pendiente',
    shortLabel: 'Cobrar',
    icon: DollarSign,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    textColor: 'text-red-700',
    description: 'Facturados sin cobrar',
  },
];

function classifyJob(job: Job): PipelineStage | null {
  // Cancelled or fully paid jobs don't appear in pipeline
  if (job.status === 'cancelled' || job.status === 'paid') return null;

  // 1. Budget pending: has a budget that's pending approval
  if (job.budgetStatus === 'pending') return 'budget_pending';

  // 2. OC pending: budget approved, needs OC but doesn't have it yet
  if (
    job.budgetStatus === 'approved' &&
    !job.hasPurchaseOrder &&
    (job.status === 'pending')
  ) return 'oc_pending';

  // 3. OC not started: has OC (or doesn't need one) but work hasn't started
  if (
    job.status === 'pending' &&
    (job.hasPurchaseOrder || job.budgetStatus === 'not_needed' || job.budgetStatus === 'approved')
  ) return 'oc_not_started';

  // 4. In progress
  if (job.status === 'in_progress') return 'in_progress';

  // 5. Invoice pending: completed but no invoice
  if (job.status === 'completed' && job.needsInvoice && !job.invoiceNumber) {
    return 'invoice_pending';
  }

  // 6. Collection pending: invoiced or completed with invoice, balance > 0
  if (
    (job.status === 'invoiced' || (job.status === 'completed' && job.invoiceNumber)) &&
    job.balanceDue > 0
  ) return 'collection_pending';

  // Also collection pending if balance due > 0 and status is in_progress/completed
  if (job.balanceDue > 0 && job.status !== 'pending') return 'collection_pending';

  return null;
}

function getDaysSince(dateStr: string): number {
  if (!dateStr) return 0;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? (() => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      })()
    : new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyLevel(days: number): { label: string; color: string } {
  if (days > 30) return { label: `${days}d`, color: 'text-red-600 bg-red-100' };
  if (days > 14) return { label: `${days}d`, color: 'text-amber-600 bg-amber-100' };
  if (days > 7) return { label: `${days}d`, color: 'text-yellow-600 bg-yellow-100' };
  return { label: `${days}d`, color: 'text-slate-500 bg-slate-100' };
}

function formatTotalsByCurrency(jobs: Job[]): { ars: number; usd: number } {
  return jobs.reduce(
    (acc, j) => {
      const amount = j.totalAmount;
      if (j.currency === 'USD') acc.usd += amount;
      else acc.ars += amount;
      return acc;
    },
    { ars: 0, usd: 0 }
  );
}

function formatBalanceByCurrency(jobs: Job[]): { ars: number; usd: number } {
  return jobs.reduce(
    (acc, j) => {
      const amount = j.balanceDue;
      if (j.currency === 'USD') acc.usd += amount;
      else acc.ars += amount;
      return acc;
    },
    { ars: 0, usd: 0 }
  );
}

function CurrencyTotals({ totals, label, useBalance }: { totals: { ars: number; usd: number }; label?: string; useBalance?: boolean }) {
  const hasArs = totals.ars > 0;
  const hasUsd = totals.usd > 0;
  if (!hasArs && !hasUsd) return null;
  return (
    <div className="text-xs space-y-0.5">
      {label && <span className="text-slate-400">{label}</span>}
      {hasArs && (
        <p className="font-semibold">{formatCurrency(totals.ars, 'ARS')}</p>
      )}
      {hasUsd && (
        <p className="font-semibold">{formatCurrency(totals.usd, 'USD')}</p>
      )}
    </div>
  );
}

interface JobsPipelineProps {
  jobs: Job[];
  onStatusChange: (id: string, status: Job['status']) => void;
}

export function JobsPipeline({ jobs, onStatusChange }: JobsPipelineProps) {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isViewer = userRole === 'viewer';
  const [expandedStage, setExpandedStage] = useState<PipelineStage | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);

  // Classify all jobs into pipeline stages
  const pipeline = useMemo(() => {
    const result: Record<PipelineStage, Job[]> = {
      budget_pending: [],
      oc_pending: [],
      oc_not_started: [],
      in_progress: [],
      invoice_pending: [],
      collection_pending: [],
    };

    jobs.forEach((job) => {
      const stage = classifyJob(job);
      if (stage) result[stage].push(job);
    });

    // Sort each stage by creation date (oldest first = most urgent)
    Object.keys(result).forEach((key) => {
      result[key as PipelineStage].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });

    return result;
  }, [jobs]);

  const totalPendingItems = useMemo(() => {
    return Object.values(pipeline).reduce((sum, arr) => sum + arr.length, 0);
  }, [pipeline]);

  const getRelevantDate = (job: Job, stage: PipelineStage): string => {
    switch (stage) {
      case 'budget_pending':
        return job.budgetDate || job.createdAt;
      case 'oc_pending':
        return job.budgetDate || job.createdAt;
      case 'oc_not_started':
        return job.purchaseOrderDate || job.createdAt;
      case 'in_progress':
        return job.startDate || job.createdAt;
      case 'invoice_pending':
        return job.endDate || job.createdAt;
      case 'collection_pending':
        return job.invoiceDate || job.createdAt;
      default:
        return job.createdAt;
    }
  };

  const getQuickAction = (job: Job, stage: PipelineStage) => {
    if (isViewer) return null;
    switch (stage) {
      case 'budget_pending':
        return {
          label: 'Aprobar Presupuesto',
          icon: CheckCircle,
          action: () => navigate(`/jobs/${job.id}/edit`),
        };
      case 'oc_pending':
        return {
          label: 'Cargar OC',
          icon: Package,
          action: () => navigate(`/jobs/${job.id}/edit`),
        };
      case 'oc_not_started':
        return {
          label: 'Iniciar Trabajo',
          icon: PlayCircle,
          action: () => onStatusChange(job.id, 'in_progress'),
        };
      case 'in_progress':
        return {
          label: 'Completar',
          icon: CheckCircle,
          action: () => onStatusChange(job.id, 'completed'),
        };
      case 'invoice_pending':
        return {
          label: 'Agregar Factura',
          icon: Receipt,
          action: () => navigate(`/jobs/${job.id}/edit`),
        };
      case 'collection_pending':
        return {
          label: 'Registrar Cobro',
          icon: DollarSign,
          action: () => navigate('/cobranzas'),
        };
      default:
        return null;
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-4 lg:pb-4">
      {/* Pipeline Summary Header */}
      <div className="bg-white border rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm sm:text-lg font-bold text-slate-800">Pipeline de Trabajos</h2>
            <p className="text-xs text-slate-500">
              {totalPendingItems} {totalPendingItems === 1 ? 'item pendiente' : 'items pendientes'} en total
            </p>
          </div>
        </div>

        {/* Stage Summary Cards - Horizontal scroll on mobile */}
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
          {STAGES.map((stage) => {
            const stageJobs = pipeline[stage.id];
            const count = stageJobs.length;
            const totals = stage.id === 'collection_pending' 
              ? formatBalanceByCurrency(stageJobs)
              : formatTotalsByCurrency(stageJobs);
            const isExpanded = expandedStage === stage.id;
            const Icon = stage.icon;

            return (
              <button
                key={stage.id}
                onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                className={`flex-shrink-0 snap-start p-2 sm:p-3 rounded-lg border-2 transition-all text-left min-w-[100px] sm:min-w-[140px] ${
                  isExpanded
                    ? `${stage.bgColor} ${stage.borderColor} ring-1 ring-offset-1`
                    : count > 0
                    ? `bg-white border-slate-200 hover:${stage.bgColor} hover:${stage.borderColor}`
                    : 'bg-slate-50 border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <Icon className={`w-3 h-3 sm:w-4 sm:h-4 ${count > 0 ? stage.color : 'text-slate-400'}`} />
                  <span className={`text-xs font-medium ${count > 0 ? stage.color : 'text-slate-400'}`}>
                    {stage.shortLabel}
                  </span>
                </div>
                <p className={`text-lg sm:text-2xl font-bold ${count > 0 ? stage.textColor : 'text-slate-300'}`}>
                  {count}
                </p>
                {count > 0 && <CurrencyTotals totals={totals} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded Stage Detail */}
      {expandedStage && (
        <StageDetail
          stage={STAGES.find((s) => s.id === expandedStage)!}
          jobs={pipeline[expandedStage]}
          getRelevantDate={(job) => getRelevantDate(job, expandedStage)}
          getQuickAction={(job) => getQuickAction(job, expandedStage)}
          onJobClick={(job) => { setSelectedJob(job); setActionDialogOpen(true); }}
          onNavigateEdit={(id) => navigate(`/jobs/${id}/edit`)}
          isViewer={isViewer}
        />
      )}

      {/* If no stage expanded, show all stages with items */}
      {!expandedStage && (
        <div className="space-y-3">
          {STAGES.map((stage) => {
            const stageJobs = pipeline[stage.id];
            if (stageJobs.length === 0) return null;
            return (
              <StageDetail
                key={stage.id}
                stage={stage}
                jobs={stageJobs}
                getRelevantDate={(job) => getRelevantDate(job, stage.id)}
                getQuickAction={(job) => getQuickAction(job, stage.id)}
                onJobClick={(job) => { setSelectedJob(job); setActionDialogOpen(true); }}
                onNavigateEdit={(id) => navigate(`/jobs/${id}/edit`)}
                isViewer={isViewer}
                collapsed
                onExpand={() => setExpandedStage(stage.id)}
              />
            );
          })}

          {totalPendingItems === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border">
              <CheckCircle className="w-16 h-16 mx-auto text-emerald-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600 mb-2">Todo al día</h3>
              <p className="text-slate-500">No hay items pendientes en el pipeline</p>
            </div>
          )}
        </div>
      )}

      {/* Job Quick Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-sm sm:text-base">
              <span className="font-mono text-sky-600">{selectedJob?.jobNumber}</span>
              {selectedJob && (
                <Badge className={`${(JOB_STATUS[selectedJob.status as keyof typeof JOB_STATUS] ?? JOB_STATUS.pending).color} text-xs`}>
                  {(JOB_STATUS[selectedJob.status as keyof typeof JOB_STATUS] ?? JOB_STATUS.pending).label}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedJob?.title}
            </DialogDescription>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-medium">{selectedJob.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total:</span>
                  <span className="font-bold">{formatCurrency(selectedJob.totalAmount, selectedJob.currency)}</span>
                </div>
                {selectedJob.balanceDue > 0 && selectedJob.balanceDue !== selectedJob.totalAmount && (
                  <div className="flex justify-between text-red-600">
                    <span>Saldo pendiente:</span>
                    <span className="font-bold">{formatCurrency(selectedJob.balanceDue, selectedJob.currency)}</span>
                  </div>
                )}
                {selectedJob.budgetNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Presupuesto:</span>
                    <span>{selectedJob.budgetNumber}</span>
                  </div>
                )}
                {selectedJob.purchaseOrderNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">OC:</span>
                    <span>{selectedJob.purchaseOrderNumber}</span>
                  </div>
                )}
                {selectedJob.invoiceNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Factura:</span>
                    <span>{selectedJob.invoiceNumber}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 flex-1 touch-manipulation text-sm sm:h-9 sm:text-xs"
                  onClick={() => { setActionDialogOpen(false); navigate(`/jobs/${selectedJob.id}/edit`); }}
                >
                  <Edit className="w-3.5 h-3.5 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 flex-1 touch-manipulation text-sm sm:h-9 sm:text-xs"
                  onClick={() => { setActionDialogOpen(false); }}
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Stage Detail Component
function StageDetail({
  stage,
  jobs,
  getRelevantDate,
  getQuickAction,
  onJobClick,
  onNavigateEdit,
  isViewer,
  collapsed,
  onExpand,
}: {
  stage: StageConfig;
  jobs: Job[];
  getRelevantDate: (job: Job) => string;
  getQuickAction: (job: Job) => { label: string; icon: any; action: () => void } | null;
  onJobClick: (job: Job) => void;
  onNavigateEdit: (id: string) => void;
  isViewer: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const Icon = stage.icon;
  const totals = stage.id === 'collection_pending'
    ? formatBalanceByCurrency(jobs)
    : formatTotalsByCurrency(jobs);
  const displayJobs = collapsed ? jobs.slice(0, 3) : jobs;

  return (
    <Card className={`border-l-4 ${stage.borderColor}`}>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stage.color}`} />
            <span className={stage.textColor}>{stage.label}</span>
            <Badge variant="secondary" className="text-xs ml-1">
              {jobs.length}
            </Badge>
          </CardTitle>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <CurrencyTotals totals={totals} />
            {collapsed && jobs.length > 3 && onExpand && (
              <Button variant="ghost" size="sm" onClick={onExpand} className="h-11 text-xs sm:h-7">
                Ver todos <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">{stage.description}</p>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3">
        <div className="space-y-1.5 sm:space-y-2">
          {displayJobs.map((job) => {
            const days = getDaysSince(getRelevantDate(job));
            const urgency = getUrgencyLevel(days);
            const quickAction = getQuickAction(job);

            return (
              <div
                key={job.id}
                className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border ${stage.bgColor} border-opacity-50 hover:shadow-sm transition-shadow cursor-pointer`}
                onClick={() => onJobClick(job)}
              >
                {/* Job info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-xs font-medium text-sky-600">
                      {job.jobNumber}
                    </span>
                    {days > 0 && (
                      <Badge className={`${urgency.color} px-1 py-0 text-xs`}>
                        <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5" />
                        {urgency.label}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium text-slate-800">
                    {job.title}
                  </p>
                  <p className="text-xs text-slate-500">{job.clientName}</p>
                  {job.technicianNames.length > 0 && (
                    <p className="text-xs text-slate-400 flex items-center gap-0.5 mt-0.5">
                      <Wrench className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                      {job.technicianNames.join(', ')}
                    </p>
                  )}
                  {/* Stage-specific info */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {job.budgetNumber && (
                      <Badge variant="outline" className="px-1 py-0 text-xs">
                        Pres: {job.budgetNumber}
                      </Badge>
                    )}
                    {job.purchaseOrderNumber && (
                      <Badge variant="outline" className="px-1 py-0 text-xs text-emerald-600">
                        OC: {job.purchaseOrderNumber}
                      </Badge>
                    )}
                    {job.invoiceNumber && (
                      <Badge variant="outline" className="px-1 py-0 text-xs text-purple-600">
                        Fact: {job.invoiceNumber}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xs sm:text-sm font-bold text-slate-800">
                    {formatCurrency(
                      stage.id === 'collection_pending' ? job.balanceDue : job.totalAmount,
                      job.currency
                    )}
                  </p>
                  {stage.id === 'collection_pending' && job.balanceDue !== job.totalAmount && (
                    <p className="text-xs text-slate-400">
                      de {formatCurrency(job.totalAmount, job.currency)}
                    </p>
                  )}
                </div>

                {/* Quick action button */}
                {quickAction && !isViewer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`hidden sm:flex h-7 text-xs ${stage.color} hover:${stage.bgColor} flex-shrink-0`}
                    onClick={(e) => {
                      e.stopPropagation();
                      quickAction.action();
                    }}
                  >
                    <quickAction.icon className="w-3 h-3 mr-0.5" />
                    {quickAction.label}
                  </Button>
                )}
                {quickAction && !isViewer && (
                  <Button
                    variant="ghost"
                    size="icon" aria-label={`Avanzar ${job.title}`}
                    className={`h-11 w-11 flex-shrink-0 touch-manipulation sm:hidden ${stage.color}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      quickAction.action();
                    }}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {collapsed && jobs.length > 3 && onExpand && (
          <button
            onClick={onExpand}
            className={`mt-2 min-h-11 w-full touch-manipulation rounded-lg border border-dashed p-2 text-xs transition-opacity hover:opacity-80 ${stage.borderColor} ${stage.bgColor} ${stage.color}`}
          >
            + {jobs.length - 3} más...
          </button>
        )}
      </CardContent>
    </Card>
  );
}
