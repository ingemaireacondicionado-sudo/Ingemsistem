import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Wrench,
  StickyNote,
  DollarSign,
  Briefcase,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  FileText,
  Receipt,
  Plus,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  User,
  PlayCircle,
  Kanban,
  Package,
  Phone,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Customer } from '@/types/customer';
import type { Supplier } from '@/types/supplier';
import type { Product } from '@/types/product';
import { parseLocalDate } from '@/lib/dateUtils';
import type { Appointment } from '@/types/appointment';
import type { Technician } from '@/types/technician';
import type { Note } from '@/types/note';
import type { Transaction } from '@/types/transaction';
import type { Job } from '@/types/job';
import { formatCurrency as formatTransactionCurrency } from '@/types/transaction';
import { formatCurrency as formatJobCurrency } from '@/types/job';
import { PRIORITY_OPTIONS, NOTE_STATUS } from '@/types/note';
import { checkTechnicianDocumentation } from '@/types/technician';
import { useAuth } from '@/contexts/AuthContext';
import { calculateNetMonthlyProfit } from '@/lib/marginUtils';

import { cleanPhone, whatsappUrl, mapsUrl } from '@/lib/contactUtils';
import { generateDayAgendaMessage } from '@/lib/agendaMessage';
import { toast } from 'sonner';

interface DashboardProps {
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  appointments: Appointment[];
  technicians: Technician[];
  notes: Note[];
  transactions: Transaction[];
  jobs: Job[];
}

export function Dashboard({ 
  customers, 
  suppliers, 
  products, 
  appointments, 
  technicians, 
  notes, 
  transactions,
  jobs 
}: DashboardProps) {
  const navigate = useNavigate();
  const { user: currentUser, userRole, canCreateEntity, canEditEntity } = useAuth();
  const isAdmin = userRole === 'admin';
  const canEditAppointments = canEditEntity('appointments');
  const canEditNotes = canEditEntity('notes');

  // --- Date helpers ---
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
  const _tom = new Date(_now); _tom.setDate(_tom.getDate()+1);
  const tomorrow = `${_tom.getFullYear()}-${String(_tom.getMonth()+1).padStart(2,'0')}-${String(_tom.getDate()).padStart(2,'0')}`;
  const currentMonth = _now.getMonth();
  const currentYear = _now.getFullYear();

  // --- Notas: filtrar por currentUser.id (NO por nombre hardcodeado) ---
  const currentUserId = currentUser?.id || '';
  const pendingNotes = notes.filter(n => n.status === 'pending' || n.status === 'in_progress');
  const myNotes = pendingNotes.filter(n => 
    n.assignedTo === currentUserId || 
    n.assignedTo === 'both' || 
    n.createdBy === currentUser?.name
  );
  const overdueNotes = pendingNotes.filter(n => Boolean(n.dueDate) && n.dueDate! < today);

  // --- Turnos de HOY y MAÑANA ---
  const todayAppointments = appointments
    .filter(a => a.date === today && a.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time));
  const pendingTodayAppointments = todayAppointments.filter(a => a.status === 'pending');
  const tomorrowAppointments = appointments
    .filter(a => a.date === tomorrow && a.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time));

  // --- Facturas vencidas (reusing InvoiceTracker logic) ---
  const PAYMENT_DAYS = 30;
  const invoicedJobs = jobs.filter(j => 
    (j.status === 'invoiced' || (j.status === 'completed' && j.invoiceNumber)) && j.balanceDue > 0
  );
  const overdueJobs = invoicedJobs.filter(j => {
    const invoiceDate = j.invoiceDate || j.endDate || j.startDate;
    if (!invoiceDate) return false;
    const invDateObj = new Date(invoiceDate + 'T12:00:00');
    const diffMs = _now.getTime() - invDateObj.getTime();
    const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return daysElapsed > PAYMENT_DAYS;
  });
  const notOverdueJobs = invoicedJobs.filter(j => !overdueJobs.includes(j));
  const overdueARS = overdueJobs.filter(j => j.currency !== 'USD').reduce((s, j) => s + j.balanceDue, 0);
  const overdueUSD = overdueJobs.filter(j => j.currency === 'USD').reduce((s, j) => s + j.balanceDue, 0);
  const notOverdueARS = notOverdueJobs.filter(j => j.currency !== 'USD').reduce((s, j) => s + j.balanceDue, 0);
  const notOverdueUSD = notOverdueJobs.filter(j => j.currency === 'USD').reduce((s, j) => s + j.balanceDue, 0);

  // --- Trabajos por facturar ---
  const jobsToInvoice = jobs.filter(j => j.status === 'completed' && j.needsInvoice && !j.invoiceNumber);
  const jobsToBudget = jobs.filter(j => j.budgetStatus === 'pending');
  const totalToInvoiceARS = jobsToInvoice.filter(j => j.currency !== 'USD').reduce((s, j) => s + j.totalAmount, 0);
  const totalToInvoiceUSD = jobsToInvoice.filter(j => j.currency === 'USD').reduce((s, j) => s + j.totalAmount, 0);

  // --- Stock bajo (con purchasePrice) ---
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);
  const lowStockValue = lowStockProducts.reduce((sum, p) => sum + (p.stock * p.purchasePrice), 0);

  // --- Técnicos con documentación pendiente ---
  const techniciansWithIssues = technicians.filter(t => {
    if (!t.isActive) return false;
    const doc = checkTechnicianDocumentation(t);
    return !doc.isValid;
  });

  // --- Finanzas del mes actual y anterior ---
  const monthTransactions = transactions.filter(t => {
    const d = parseLocalDate(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const monthIncome = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.totalAmount, 0);
  const monthExpense = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.totalAmount, 0);
  const monthBalance = monthIncome - monthExpense;

  // Mes anterior
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthTransactions = transactions.filter(t => {
    const d = parseLocalDate(t.date);
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });
  const prevMonthIncome = prevMonthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.totalAmount, 0);
  const prevMonthExpense = prevMonthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.totalAmount, 0);

  const incomeVariation = prevMonthIncome > 0 ? ((monthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;
  const expenseVariation = prevMonthExpense > 0 ? ((monthExpense - prevMonthExpense) / prevMonthExpense) * 100 : 0;

  // --- Header summary ---
  const todayCount = todayAppointments.length;
  const overdueCount = overdueJobs.length;
  const summaryParts: string[] = [];
  if (todayCount > 0) summaryParts.push(`${todayCount} turno${todayCount > 1 ? 's' : ''}`);
  if (overdueCount > 0) summaryParts.push(`${overdueCount} factura${overdueCount > 1 ? 's' : ''} vencida${overdueCount > 1 ? 's' : ''}`);
  if (jobsToInvoice.length > 0) summaryParts.push(`${jobsToInvoice.length} por facturar`);
  const summaryLine = summaryParts.length > 0 ? `Hoy: ${summaryParts.join(' · ')}` : 'Todo al día';

  // --- Pipeline ---
  const classifyJobStage = (job: Job) => {
    if (job.status === 'cancelled' || job.status === 'paid') return null;
    if (job.budgetStatus === 'pending') return 'budget_pending';
    if (job.budgetStatus === 'approved' && !job.hasPurchaseOrder && job.status === 'pending') return 'oc_pending';
    if (job.status === 'pending' && (job.hasPurchaseOrder || job.budgetStatus === 'not_needed' || job.budgetStatus === 'approved')) return 'oc_not_started';
    if (job.status === 'in_progress') return 'in_progress';
    if (job.status === 'completed' && job.needsInvoice && !job.invoiceNumber) return 'invoice_pending';
    if ((job.status === 'invoiced' || (job.status === 'completed' && job.invoiceNumber)) && job.balanceDue > 0) return 'collection_pending';
    if (job.balanceDue > 0 && job.status !== 'pending') return 'collection_pending';
    return null;
  };
  const stages = [
    { id: 'budget_pending', label: 'Presupuestos', icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', path: '/presupuestos' },
    { id: 'oc_pending', label: 'OC Pendientes', icon: Package, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', path: '/oc-pendientes' },
    { id: 'oc_not_started', label: 'Sin Iniciar', icon: PlayCircle, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200', path: '/jobs' },
    { id: 'in_progress', label: 'Ejecutando', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', path: '/jobs' },
    { id: 'invoice_pending', label: 'Facturar', icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', path: '/jobs' },
    { id: 'collection_pending', label: 'Cobrar', icon: DollarSign, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', path: '/cobranzas' },
  ];
  const pipeline: Record<string, Job[]> = {};
  stages.forEach(s => { pipeline[s.id] = []; });
  jobs.forEach(job => {
    const stage = classifyJobStage(job);
    if (stage && pipeline[stage]) pipeline[stage].push(job);
  });
  const totalPending = Object.values(pipeline).reduce((sum, arr) => sum + arr.length, 0);

  const formatTotals = (stageJobs: Job[], useBalance = false) => {
    const totals = stageJobs.reduce((acc, j) => {
      const amount = useBalance ? j.balanceDue : j.totalAmount;
      if (j.currency === 'USD') acc.usd += amount;
      else acc.ars += amount;
      return acc;
    }, { ars: 0, usd: 0 });
    const parts: string[] = [];
    if (totals.ars > 0) parts.push(formatJobCurrency(totals.ars, 'ARS'));
    if (totals.usd > 0) parts.push(formatJobCurrency(totals.usd, 'USD'));
    return parts.join(' | ');
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* (a) Header compacto */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
            Hola, {currentUser?.name?.split(' ')[0] || 'Usuario'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {_now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}
            <span className={overdueCount > 0 ? 'text-red-600 font-medium' : ''}>{summaryLine}</span>
          </p>
        </div>
      </div>

      {/* (b) Accesos Rápidos */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
        {canCreateEntity('customers') && <Button onClick={() => navigate('/customers/new')} className="h-11 touch-manipulation bg-blue-600 px-3 text-sm sm:h-10 sm:px-4">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Cliente
        </Button>}
        {canCreateEntity('jobs') && <Button onClick={() => navigate('/jobs/new')} className="h-11 touch-manipulation bg-indigo-600 px-3 text-sm sm:h-10 sm:px-4">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Trabajo
        </Button>}
        {canCreateEntity('jobs') && <Button onClick={() => navigate('/presupuestos/nuevo')} variant="outline" className="h-11 touch-manipulation border-orange-200 px-3 text-sm text-orange-700 hover:bg-orange-50 sm:h-10 sm:px-4">
          <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Presupuesto
        </Button>}
        {canCreateEntity('appointments') && <Button onClick={() => navigate('/calendar/new')} className="h-11 touch-manipulation bg-purple-600 px-3 text-sm sm:h-10 sm:px-4">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Turno
        </Button>}
        {canCreateEntity('transactions') && <Button onClick={() => navigate('/finance/income/new')} className="h-11 touch-manipulation bg-emerald-600 px-3 text-sm sm:h-10 sm:px-4">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Ingreso
        </Button>}
        {canCreateEntity('transactions') && <Button onClick={() => navigate('/finance/expense/new')} className="h-11 touch-manipulation bg-red-600 px-3 text-sm sm:h-10 sm:px-4">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Gasto
        </Button>}
        {canCreateEntity('notes') && <Button onClick={() => navigate('/notes/new')} variant="outline" className="h-11 touch-manipulation px-3 text-sm sm:h-10 sm:px-4">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Nota
        </Button>}
      </div>

      {/* (c) Turnos de HOY y MAÑANA */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
              Agenda
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-sm h-11 sm:h-9 px-2 sm:px-3 touch-manipulation" onClick={() => navigate('/calendar')}>
              Ver agenda <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5 sm:ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {todayAppointments.length === 0 && tomorrowAppointments.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <CalendarDays className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No hay turnos para hoy ni mañana</p>
              {canCreateEntity('appointments') && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/calendar/new')}>
                  <Plus className="w-4 h-4 mr-2" /> Agregar turno
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Hoy */}
              {todayAppointments.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Hoy ({todayAppointments.length})
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 touch-manipulation px-3 text-xs text-slate-500 hover:text-green-700 sm:min-h-8 sm:px-2"
                      onClick={async () => {
                        const msg = generateDayAgendaMessage(today, appointments, 'equipo');
                        if (navigator.share) {
                          try { await navigator.share({ text: msg }); } catch (e) { /* cancelled */ }
                        } else {
                          await navigator.clipboard.writeText(msg);
                          toast.success('Agenda copiada al portapapeles');
                        }
                      }}
                    >
                      <MessageCircle className="w-3 h-3 mr-1" />
                      Compartir
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {todayAppointments.map(apt => (
                      <AppointmentRow key={apt.id} apt={apt} navigate={navigate} canEdit={canEditAppointments} />
                    ))}
                  </div>
                </div>
              )}
              {/* Mañana */}
              {tomorrowAppointments.length > 0 && (
                <div className={todayAppointments.length > 0 ? 'pt-2 border-t' : ''}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Mañana ({tomorrowAppointments.length})
                  </p>
                  <div className="space-y-2">
                    {tomorrowAppointments.map(apt => (
                      <AppointmentRow key={apt.id} apt={apt} navigate={navigate} canEdit={canEditAppointments} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* (d) Centro de prioridades administrativas */}
      {(overdueJobs.length > 0 || notOverdueJobs.length > 0 || jobsToInvoice.length > 0 || jobsToBudget.length > 0 || overdueNotes.length > 0 || pendingTodayAppointments.length > 0 || lowStockProducts.length > 0 || techniciansWithIssues.length > 0) && (
        <section aria-labelledby="dashboard-priorities" className="space-y-2">
          <div>
            <h2 id="dashboard-priorities" className="text-base font-semibold text-slate-800 sm:text-lg">Prioridades administrativas</h2>
            <p className="text-xs text-slate-500">Asuntos que requieren seguimiento o una acción.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {/* Notas vencidas */}
          {overdueNotes.length > 0 && (
            <Card className="cursor-pointer border-rose-300 bg-rose-50 transition-shadow hover:shadow-md" onClick={() => navigate('/notes?view=overdue')}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-200">
                    <StickyNote className="h-5 w-5 text-rose-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-rose-600">Notas vencidas</p>
                    <p className="text-lg font-bold text-rose-700">{overdueNotes.length}</p>
                    <p className="truncate text-xs text-rose-500">Requieren seguimiento</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Turnos de hoy todavía sin confirmar */}
          {pendingTodayAppointments.length > 0 && (
            <Card className="cursor-pointer border-blue-200 bg-blue-50 transition-shadow hover:shadow-md" onClick={() => navigate('/calendar')}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <CalendarDays className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-blue-600">Sin confirmar hoy</p>
                    <p className="text-lg font-bold text-blue-700">{pendingTodayAppointments.length}</p>
                    <p className="truncate text-xs text-blue-500">Revisar agenda</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vencidos (rojo) */}
          {overdueJobs.length > 0 && (
            <Card className="bg-red-50 border-red-300 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/cobranzas')}>
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-red-600 font-semibold uppercase">Vencidos</p>
                    <p className="text-sm sm:text-lg font-bold text-red-700">{overdueJobs.length}</p>
                    <p className="text-xs text-red-500 truncate">
                      {overdueARS > 0 ? formatJobCurrency(overdueARS, 'ARS') : ''}
                      {overdueARS > 0 && overdueUSD > 0 ? ' + ' : ''}
                      {overdueUSD > 0 ? formatJobCurrency(overdueUSD, 'USD') : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Por Cobrar (solo no vencidos) */}
          {notOverdueJobs.length > 0 && (
            <Card className="bg-amber-50 border-amber-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/cobranzas')}>
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-amber-600 font-semibold uppercase">Por Cobrar</p>
                    <p className="text-sm sm:text-lg font-bold text-amber-700">{notOverdueJobs.length}</p>
                    <p className="text-xs text-amber-500 truncate">
                      {notOverdueARS > 0 ? formatJobCurrency(notOverdueARS, 'ARS') : ''}
                      {notOverdueARS > 0 && notOverdueUSD > 0 ? ' + ' : ''}
                      {notOverdueUSD > 0 ? formatJobCurrency(notOverdueUSD, 'USD') : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Por Facturar */}
          {jobsToInvoice.length > 0 && (
            <Card className="bg-purple-50 border-purple-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/jobs')}>
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-purple-600 font-semibold uppercase">Por Facturar</p>
                    <p className="text-sm sm:text-lg font-bold text-purple-700">{jobsToInvoice.length}</p>
                    <p className="text-xs text-purple-500 truncate">
                      {totalToInvoiceARS > 0 ? formatJobCurrency(totalToInvoiceARS, 'ARS') : ''}
                      {totalToInvoiceARS > 0 && totalToInvoiceUSD > 0 ? ' + ' : ''}
                      {totalToInvoiceUSD > 0 ? formatJobCurrency(totalToInvoiceUSD, 'USD') : ''}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Presupuestar */}
          {jobsToBudget.length > 0 && (
            <Card className="bg-orange-50 border-orange-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/presupuestos')}>
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-orange-600 font-semibold uppercase">Presupuestar</p>
                    <p className="text-sm sm:text-lg font-bold text-orange-700">{jobsToBudget.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stock bajo (solo si hay alerta) */}
          {lowStockProducts.length > 0 && (
            <Card className="bg-yellow-50 border-yellow-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/products')}>
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-yellow-600 font-semibold uppercase">Stock Bajo</p>
                    <p className="text-sm sm:text-lg font-bold text-yellow-700">{lowStockProducts.length} prod.</p>
                    <p className="text-xs text-yellow-500 truncate">
                      Capital: {formatTransactionCurrency(lowStockValue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Técnicos con doc pendiente (solo si hay alerta) */}
          {techniciansWithIssues.length > 0 && (
            <Card className="bg-cyan-50 border-cyan-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/technicians')}>
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-cyan-600 font-semibold uppercase">Doc. Pendiente</p>
                    <p className="text-sm sm:text-lg font-bold text-cyan-700">{techniciansWithIssues.length} téc.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          </div>
        </section>
      )}

      {/* (e) Pipeline de Trabajos */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Kanban className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
              Pipeline de Trabajos
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-sm h-11 sm:h-9 px-2 sm:px-3 touch-manipulation" onClick={() => navigate('/jobs')}>
              Ver todos <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5 sm:ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {totalPending === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">No hay trabajos pendientes en el pipeline</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">
                {totalPending} {totalPending === 1 ? 'trabajo pendiente' : 'trabajos pendientes'} en total
              </p>
              {stages.map(stage => {
                const stageJobs = pipeline[stage.id];
                const count = stageJobs.length;
                const isCollectionStage = stage.id === 'collection_pending';
                const totalsStr = count > 0 ? formatTotals(stageJobs, isCollectionStage) : '';
                const StageIcon = stage.icon;
                return (
                  <div
                    key={stage.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                      count > 0 
                        ? `${stage.bg} ${stage.border} cursor-pointer hover:shadow-sm` 
                        : 'bg-slate-50 border-slate-100 opacity-50'
                    }`}
                    onClick={() => count > 0 && navigate(stage.path)}
                  >
                    <div className="flex items-center gap-2.5">
                      <StageIcon className={`w-4 h-4 ${count > 0 ? stage.color : 'text-slate-400'}`} />
                      <span className={`text-sm font-medium ${count > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
                        {stage.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {totalsStr && (
                        <span className={`text-xs font-semibold ${stage.color}`}>
                          {totalsStr}
                        </span>
                      )}
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                        count > 0 ? `${stage.bg} ${stage.color}` : 'bg-slate-100 text-slate-400'
                      }`}>
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* (f) Finanzas del Mes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
              Finanzas del Mes
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-sm h-11 sm:h-9 px-2 sm:px-3 touch-manipulation" onClick={() => navigate('/finance')}>
              Ver más <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5 sm:ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Ingresos */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 bg-emerald-50 rounded-lg">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                <span className="text-xs sm:text-sm text-slate-600">Ingresos</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-lg font-bold text-emerald-700">{formatTransactionCurrency(monthIncome)}</span>
                {prevMonthIncome > 0 && (
                  <VariationBadge value={incomeVariation} />
                )}
              </div>
            </div>
            {/* Gastos */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 bg-red-50 rounded-lg">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                <span className="text-xs sm:text-sm text-slate-600">Gastos</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-lg font-bold text-red-700">{formatTransactionCurrency(monthExpense)}</span>
                {prevMonthExpense > 0 && (
                  <VariationBadge value={expenseVariation} invert />
                )}
              </div>
            </div>
            {/* Balance */}
            <div className={`flex items-center justify-between p-2.5 sm:p-3 rounded-lg ${monthBalance >= 0 ? 'bg-blue-50' : 'bg-amber-50'}`}>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <DollarSign className={`w-4 h-4 sm:w-5 sm:h-5 ${monthBalance >= 0 ? 'text-blue-600' : 'text-amber-600'}`} />
                <span className="text-xs sm:text-sm text-slate-600">Balance</span>
              </div>
              <span className={`text-sm sm:text-lg font-bold ${monthBalance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                {formatTransactionCurrency(monthBalance)}
              </span>
            </div>
            {/* Margen de caja */}
            <div className="pt-1">
              <div className="flex justify-between text-xs sm:text-sm text-slate-500 mb-1">
                <span>Margen de caja</span>
                <span>{monthIncome > 0 ? Math.round((monthBalance / monthIncome) * 100) : 0}%</span>
              </div>
              <Progress 
                value={monthIncome > 0 ? Math.max(0, Math.min(100, (monthBalance / monthIncome) * 100)) : 0} 
                className="h-2"
              />
            </div>
            {/* Ganancia por trabajos - solo admin */}
            {isAdmin && (() => {
              const profit = calculateNetMonthlyProfit(jobs, products, transactions, currentYear, currentMonth);
              const totalRevenue = profit.jobMarginsARS + profit.generalIncomeARS;
              const marginPct = totalRevenue > 0 ? Math.round((profit.profitARS / totalRevenue) * 100) : 0;
              return (
                <div className="flex items-center justify-between p-2.5 sm:p-3 bg-violet-50 rounded-lg mt-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" />
                    <span className="text-xs sm:text-sm text-slate-600">Ganancia por trabajos</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm sm:text-lg font-bold text-violet-700">
                      {formatTransactionCurrency(profit.jobMarginsARS)}
                    </span>
                    {marginPct !== 0 && (
                      <span className="text-xs text-violet-500 ml-1">({marginPct}%)</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* (g) Notas Pendientes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <StickyNote className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
              Mis Notas Pendientes
              {myNotes.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{myNotes.length}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-sm h-11 sm:h-9 px-2 sm:px-3 touch-manipulation" onClick={() => navigate('/notes')}>
              Ver más <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5 sm:ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {myNotes.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">No tienes notas pendientes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myNotes.slice(0, 5).map((note) => (
                <div 
                  key={note.id} 
                  className={`p-3 rounded-lg border-l-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                    note.priority === 'urgent' ? 'bg-red-50 border-red-500' :
                    note.priority === 'high' ? 'bg-orange-50 border-orange-500' :
                    note.priority === 'medium' ? 'bg-blue-50 border-blue-500' :
                    'bg-slate-50 border-slate-300'
                  }`}
                  onClick={() => navigate(canEditNotes ? `/notes/${note.id}/edit` : '/notes')}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800 text-sm truncate">{note.title}</p>
                    <Badge className={(NOTE_STATUS[note.status as keyof typeof NOTE_STATUS] ?? NOTE_STATUS.pending).color}>
                      {(NOTE_STATUS[note.status as keyof typeof NOTE_STATUS] ?? NOTE_STATUS.pending).label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={(PRIORITY_OPTIONS[note.priority as keyof typeof PRIORITY_OPTIONS] ?? PRIORITY_OPTIONS.medium).color}>
                      {(PRIORITY_OPTIONS[note.priority as keyof typeof PRIORITY_OPTIONS] ?? PRIORITY_OPTIONS.medium).label}
                    </Badge>
                    {note.dueDate && (
                      <span className="text-xs text-slate-500">
                        Vence: {parseLocalDate(note.dueDate).toLocaleDateString('es-AR')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Sub-components ---

function AppointmentRow({ apt, navigate, canEdit }: { apt: Appointment; navigate: (path: string) => void; canEdit: boolean }) {
  return (
    <div className="p-2.5 sm:p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div 
          className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1 cursor-pointer"
          onClick={() => navigate(canEdit ? `/calendar/${apt.id}/edit` : '/calendar')}
        >
          <div className={`w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0 ${
            apt.status === 'pending' ? 'bg-amber-500' :
            apt.status === 'confirmed' ? 'bg-blue-500' :
            apt.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'
          }`}>
            {apt.time.slice(0, 5)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{apt.title}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
              <User className="w-3 h-3 flex-shrink-0" /> {apt.clientName}
            </p>
            {apt.address && (
              <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" /> {apt.address}
              </p>
            )}
            {apt.technicianNames.length > 0 && (
              <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                <Wrench className="w-3 h-3 flex-shrink-0" /> {apt.technicianNames.join(', ')}
              </p>
            )}
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {apt.clientPhone && (
            <>
              <a
                href={`tel:${cleanPhone(apt.clientPhone)}`}
                className="w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-blue-100 flex items-center justify-center hover:bg-blue-200 transition-colors touch-manipulation"
                onClick={e => e.stopPropagation()}
              >
                <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600" />
              </a>
              <a
                href={whatsappUrl(apt.clientPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 transition-colors touch-manipulation"
                onClick={e => e.stopPropagation()}
              >
                <MessageCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-600" />
              </a>
            </>
          )}
          {apt.address && (
            <a
              href={mapsUrl(apt.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-purple-100 flex items-center justify-center hover:bg-purple-200 transition-colors touch-manipulation"
              onClick={e => e.stopPropagation()}
            >
              <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-600" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function VariationBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  const isPositive = value >= 0;
  // For expenses, positive variation is bad (invert colors)
  const isGood = invert ? !isPositive : isPositive;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
      isGood ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    }`}>
      <Icon className="w-3 h-3" />
      {Math.abs(Math.round(value))}%
    </span>
  );
}
