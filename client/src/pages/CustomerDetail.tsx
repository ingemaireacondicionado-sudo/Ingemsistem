import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  FileText,
  User,
  Clock,
  Wrench,
  DollarSign,
  StickyNote,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Timer,
  XCircle,
  Hash,
  MessageCircle,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState, useMemo } from 'react';
import type { Customer } from '@/types/customer';
import type { Appointment } from '@/types/appointment';
import type { Job } from '@/types/job';
import type { Transaction } from '@/types/transaction';
import type { Note } from '@/types/note';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/dateUtils';
import { cleanPhone, mapsUrl, whatsappUrl } from '@/lib/contactUtils';

interface CustomerDetailProps {
  customers: Customer[];
  onDelete: (id: string) => void | Promise<void>;
  appointments?: Appointment[];
  jobs?: Job[];
  transactions?: Transaction[];
  notes?: Note[];
}

const statusLabels: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  prospect: 'Cliente Potencial',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-700',
  prospect: 'bg-amber-100 text-amber-700',
};

const customerTypeLabels: Record<string, string> = {
  company: 'Empresa',
  individual: 'Persona Individual',
};

const customerTypeColors: Record<string, string> = {
  company: 'bg-indigo-100 text-indigo-700',
  individual: 'bg-purple-100 text-purple-700',
};

function getCustomerDetailDisplayName(customer: Customer): string {
  if (customer.customerType === 'company' && customer.company?.trim()) return customer.company.trim();
  return `${customer.firstName} ${customer.lastName}`.trim() || 'Cliente sin nombre';
}

function buildCustomerDetailAddress(customer: Customer): string {
  const parts = [customer.address, customer.city, customer.country]
    .map(part => part?.trim() || '')
    .filter(Boolean);

  return parts.filter((part, index) => {
    const normalizedPart = part.toLocaleLowerCase('es-AR');
    return !parts.slice(0, index).some(previousPart =>
      previousPart.toLocaleLowerCase('es-AR').includes(normalizedPart)
    );
  }).join(', ');
}

const appointmentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const appointmentStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const jobStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En Progreso',
  completed: 'Completado',
  invoiced: 'Facturado',
  paid: 'Cobrado',
  cancelled: 'Cancelado',
};

const jobStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  invoiced: 'bg-purple-100 text-purple-700',
  paid: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
};

const appointmentStatusIcons: Record<string, any> = {
  pending: Timer,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  cancelled: XCircle,
};

const jobStatusIcons: Record<string, any> = {
  pending: Timer,
  in_progress: Wrench,
  completed: CheckCircle2,
  invoiced: DollarSign,
  paid: CheckCircle2,
  cancelled: XCircle,
};

interface TimelineEvent {
  id: string;
  type: 'appointment' | 'job' | 'transaction' | 'note' | 'created';
  date: string;
  title: string;
  subtitle: string;
  status?: string;
  statusLabel?: string;
  statusColor?: string;
  amount?: number;
  currency?: Job['currency'];
  amountType?: 'income' | 'expense';
  icon: any;
  iconBg: string;
  link?: string;
}

export function CustomerDetail({ customers, onDelete, appointments = [], jobs = [], transactions = [], notes = [] }: CustomerDetailProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canCreateEntity, canEditEntity, canDeleteEntity } = useAuth();
  const canCreateJobs = canCreateEntity('jobs');
  const canCreateAppointments = canCreateEntity('appointments');
  const canCreateTransactions = canCreateEntity('transactions');
  const canCreateNotes = canCreateEntity('notes');
  const canEditJobs = canEditEntity('jobs');
  const canEditAppointments = canEditEntity('appointments');
  const canEditTransactions = canEditEntity('transactions');
  const canEditNotes = canEditEntity('notes');
  const canEditCustomers = canEditEntity('customers');
  const canDeleteCustomers = canDeleteEntity('customers');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const customer = customers.find(c => c.id === id);
  const customerDisplayName = customer ? getCustomerDetailDisplayName(customer) : '';
  const customerContactName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : '';
  const customerFullAddress = customer ? buildCustomerDetailAddress(customer) : '';
  const hasCompleteAddress = Boolean(customer?.address?.trim() && customer?.city?.trim() && customer?.country?.trim());

  // Filter related data for this customer
  const customerAppointments = useMemo(() => 
    appointments.filter(a => a.clientId === id).sort((a, b) => 
      new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime()
    ), [appointments, id]);

  const customerJobs = useMemo(() => 
    jobs.filter(j => j.clientId === id).sort((a, b) => 
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    ), [jobs, id]);

  const customerTransactions = useMemo(() => 
    transactions.filter(t => t.relatedClientId === id).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    ), [transactions, id]);

  // Notes don't have a direct clientId, but we can match by customer name in title/content
  const customerNotes = useMemo(() => {
    if (!customer) return [];
    const customerName = `${customer.firstName} ${customer.lastName}`.trim().toLowerCase();
    const companyName = customer.company?.toLowerCase() || '';
    return notes.filter(n => {
      if (n.customerId !== null && n.customerId !== undefined) {
        return String(n.customerId) === String(id);
      }
      const titleLower = n.title.toLowerCase();
      const contentLower = n.content.toLowerCase();
      return (
        n.category === 'client' && (
          titleLower.includes(customerName) || 
          contentLower.includes(customerName) ||
          (companyName && (titleLower.includes(companyName) || contentLower.includes(companyName)))
        )
      );
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notes, customer, id]);

  // Build unified timeline
  const timeline = useMemo((): TimelineEvent[] => {
    if (!customer) return [];
    const events: TimelineEvent[] = [];

    customerAppointments.forEach(a => {
      const StatusIcon = appointmentStatusIcons[a.status] || Calendar;
      events.push({
        id: `apt-${a.id}`,
        type: 'appointment',
        date: a.date + 'T' + a.time,
        title: a.title,
        subtitle: `${a.time}hs - ${a.technicianNames?.join(', ') || 'Sin técnico'}`,
        status: a.status,
        statusLabel: appointmentStatusLabels[a.status],
        statusColor: appointmentStatusColors[a.status],
        icon: StatusIcon,
        iconBg: 'bg-purple-100 text-purple-600',
        link: canEditAppointments ? `/calendar/${a.id}/edit` : undefined,
      });
    });

    customerJobs.forEach(j => {
      const StatusIcon = jobStatusIcons[j.status] || Wrench;
      events.push({
        id: `job-${j.id}`,
        type: 'job',
        date: j.startDate,
        title: `#${j.jobNumber} - ${j.title}`,
        subtitle: j.technicianNames?.join(', ') || 'Sin técnico asignado',
        status: j.status,
        statusLabel: jobStatusLabels[j.status],
        statusColor: jobStatusColors[j.status],
        amount: j.totalAmount || j.budgetAmount,
        currency: j.currency,
        amountType: 'income',
        icon: StatusIcon,
        iconBg: 'bg-blue-100 text-blue-600',
        link: canEditJobs ? `/jobs/${j.id}/edit` : undefined,
      });
    });

    customerTransactions.forEach(t => {
      events.push({
        id: `txn-${t.id}`,
        type: 'transaction',
        date: t.date,
        title: t.description,
        subtitle: t.invoiceNumber ? `Factura: ${t.invoiceNumber}` : (t.paymentMethod || ''),
        amount: t.totalAmount,
        amountType: t.type,
        icon: t.type === 'income' ? TrendingUp : TrendingDown,
        iconBg: t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600',
        link: canEditTransactions ? `/finance/${t.id}/edit` : undefined,
      });
    });

    customerNotes.forEach(n => {
      events.push({
        id: `note-${n.id}`,
        type: 'note',
        date: n.createdAt,
        title: n.title,
        subtitle: n.content.substring(0, 80) + (n.content.length > 80 ? '...' : ''),
        icon: StickyNote,
        iconBg: 'bg-amber-100 text-amber-600',
        link: canEditNotes ? `/notes/${n.id}/edit` : undefined,
      });
    });

    // Add creation event
    events.push({
      id: 'created',
      type: 'created',
      date: customer.createdAt,
      title: 'Cliente registrado',
      subtitle: `Se creó la ficha de ${customerDisplayName}`,
      icon: User,
      iconBg: 'bg-gray-100 text-gray-600',
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [customer, customerDisplayName, customerAppointments, customerJobs, customerTransactions, customerNotes, canEditAppointments, canEditJobs, canEditTransactions, canEditNotes]);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const invoicedJobs = customerJobs.filter(j => Boolean(j.invoiceNumber) || j.status === 'invoiced' || j.status === 'paid');
    const totalInvoicedARS = invoicedJobs
      .filter(j => j.currency !== 'USD')
      .reduce((sum, j) => sum + (j.totalAmount || 0), 0);
    const totalInvoicedUSD = invoicedJobs
      .filter(j => j.currency === 'USD')
      .reduce((sum, j) => sum + (j.totalAmount || 0), 0);
    const totalPaid = customerTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const completedJobs = customerJobs.filter(j => ['completed', 'invoiced', 'paid'].includes(j.status)).length;
    const upcomingAppointments = customerAppointments.filter(a => 
      a.status !== 'cancelled' && a.status !== 'completed' && a.date >= today
    ).length;

    return { totalInvoicedARS, totalInvoicedUSD, totalPaid, completedJobs, upcomingAppointments };
  }, [customerJobs, customerTransactions, customerAppointments]);

  if (!customer) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/customers">
            <Button variant="ghost" size="icon" aria-label="Volver a clientes">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Cliente no encontrado</h1>
        </div>
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Cliente no encontrado
            </h3>
            <p className="text-gray-500 mb-4">
              El cliente que buscas no existe o ha sido eliminado
            </p>
            <Link to="/customers">
              <Button>Volver a la lista</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDelete = async () => {
    if (isDeleting) return;
    if (!canDeleteCustomers) {
      toast.error('No tenés permiso para eliminar clientes');
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(customer.id);
      navigate('/customers');
    } catch (err) {
      console.error('Error al eliminar cliente:', err);
      toast.error('No se pudo eliminar el cliente. Probá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return parseLocalDate(dateStr).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number, currency: Job['currency'] = 'ARS') => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderTimelineEvent = (event: TimelineEvent) => {
    const Icon = event.icon;
    return (
      <div key={event.id} className="flex gap-3 sm:gap-4 group">
        <div className="flex flex-col items-center">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${event.iconBg}`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="w-0.5 flex-1 bg-gray-200 mt-2" />
        </div>
        <div className={`flex-1 pb-6 ${event.link ? 'cursor-pointer' : ''}`}
          onClick={() => event.link && navigate(event.link)}
        >
          <div className="bg-white border border-gray-100 rounded-lg p-3 sm:p-4 hover:border-gray-200 hover:shadow-sm transition-all">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{event.title}</p>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{event.subtitle}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {event.statusLabel && (
                  <Badge className={`text-xs ${event.statusColor}`}>{event.statusLabel}</Badge>
                )}
                {event.amount !== undefined && event.amount > 0 && (
                  <span className={`text-sm font-semibold ${event.amountType === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {event.amountType === 'expense' ? '-' : ''}{formatCurrency(event.amount, event.currency || 'ARS')}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">{formatDate(event.date)}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderEmptyState = (icon: any, message: string, actionLabel?: string, actionLink?: string) => {
    const EmptyIcon = icon;
    return (
      <div className="text-center py-10 sm:py-12">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <EmptyIcon className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-gray-500 mb-4">{message}</p>
        {actionLabel && actionLink && (
          <Link to={actionLink}>
            <Button variant="outline" size="sm">{actionLabel}</Button>
          </Link>
        )}
      </div>
    );
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link to="/customers">
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 touch-manipulation" aria-label="Volver a clientes">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                {customerDisplayName}
              </h1>
              <Badge className={customerTypeColors[customer.customerType]}>
                {customer.customerType === 'company' ? (
                  <Building2 className="w-3 h-3 mr-1" />
                ) : (
                  <User className="w-3 h-3 mr-1" />
                )}
                {customerTypeLabels[customer.customerType]}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={statusColors[customer.status]}>
                {statusLabels[customer.status]}
              </Badge>
              {customer.customerType === 'company' && customerContactName && customerContactName !== customerDisplayName && (
                <span className="text-sm text-gray-500 truncate">Contacto: {customerContactName}</span>
              )}
            </div>
          </div>
        </div>
        {(canEditCustomers || canDeleteCustomers) && (
          <div className="flex items-center gap-2 ml-12 sm:ml-0">
            {canEditCustomers && (
              <Link to={`/customers/${customer.id}/edit`}>
                <Button variant="outline" size="sm" className="min-h-11 min-w-11 touch-manipulation sm:min-h-9" aria-label="Editar cliente">
                  <Edit className="w-4 h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Editar</span>
                </Button>
              </Link>
            )}
            {canDeleteCustomers && (
              <Button
                variant="destructive"
                size="sm"
                className="min-h-11 min-w-11 touch-manipulation sm:min-h-9"
                aria-label="Eliminar cliente"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Eliminar</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <p className="text-xs sm:text-sm text-gray-500">Facturado</p>
            </div>
            {stats.totalInvoicedARS > 0 && <p className="text-lg sm:text-xl font-bold text-gray-900">{formatCurrency(stats.totalInvoicedARS, 'ARS')}</p>}
            {stats.totalInvoicedUSD > 0 && <p className="text-sm sm:text-base font-bold text-gray-700">{formatCurrency(stats.totalInvoicedUSD, 'USD')}</p>}
            {stats.totalInvoicedARS === 0 && stats.totalInvoicedUSD === 0 && <p className="text-lg sm:text-xl font-bold text-gray-900">$ 0</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <p className="text-xs sm:text-sm text-gray-500">Ingresos vinculados</p>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900">{formatCurrency(stats.totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="w-4 h-4 text-indigo-600" />
              <p className="text-xs sm:text-sm text-gray-500">Trabajos</p>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900">{customerJobs.length}</p>
            <p className="text-xs text-gray-400">{stats.completedJobs} completados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-purple-600" />
              <p className="text-xs sm:text-sm text-gray-500">Turnos</p>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900">{customerAppointments.length}</p>
            <p className="text-xs text-gray-400">{stats.upcomingAppointments} próximos</p>
          </CardContent>
        </Card>
      </div>

      {/* Acciones vinculadas: crean registros con este cliente preseleccionado */}
      {(canCreateJobs || canCreateAppointments || canCreateTransactions || canCreateNotes) && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {canCreateJobs && (
            <Button
              className="h-11 touch-manipulation bg-indigo-600 text-sm hover:bg-indigo-700"
              onClick={() => navigate(`/jobs/new?clientId=${customer.id}`)}
            >
              <Wrench className="mr-2 h-4 w-4" />
              Nuevo trabajo
            </Button>
          )}
          {canCreateJobs && (
            <Button
              variant="outline"
              className="h-11 touch-manipulation border-orange-200 text-sm text-orange-700 hover:bg-orange-50"
              onClick={() => navigate(`/presupuestos/nuevo?clientId=${customer.id}`)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Presupuesto
            </Button>
          )}
          {canCreateAppointments && (
            <Button
              className={`h-11 touch-manipulation text-sm ${hasCompleteAddress ? 'bg-purple-600 hover:bg-purple-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              onClick={() => navigate(!hasCompleteAddress && canEditCustomers
                ? `/customers/${customer.id}/edit`
                : `/calendar/new?clientId=${customer.id}`
              )}
            >
              {hasCompleteAddress ? <Calendar className="mr-2 h-4 w-4" /> : <MapPin className="mr-2 h-4 w-4" />}
              {hasCompleteAddress || !canEditCustomers ? 'Agendar turno' : 'Completar dirección'}
            </Button>
          )}
          {canCreateNotes && (
            <Button
              variant="outline"
              className="h-11 touch-manipulation text-sm"
              onClick={() => navigate(`/notes/new?clientId=${customer.id}`)}
            >
              <StickyNote className="mr-2 h-4 w-4" />
              Crear nota
            </Button>
          )}
          {canCreateTransactions && (
            <Button
              variant="outline"
              className="h-11 touch-manipulation border-emerald-200 text-sm text-emerald-700 hover:bg-emerald-50"
              onClick={() => navigate(`/finance/income/new?clientId=${customer.id}`)}
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Registrar ingreso
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left Column - Contact Info */}
        <div className="space-y-4 sm:space-y-6">
          {/* Profile Card */}
          <Card>
            <CardContent className="p-4 sm:p-6 text-center">
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-3 sm:mb-4">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white text-xl sm:text-2xl">
                  {customerDisplayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CL'}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                {customerDisplayName}
              </h2>
              {customer.customerType === 'company' && customerContactName && customerContactName !== customerDisplayName && (
                <p className="text-sm text-gray-500">Contacto: {customerContactName}{customer.position ? ` · ${customer.position}` : ''}</p>
              )}
              {customer.customerType !== 'company' && customer.position && <p className="text-gray-500 text-sm">{customer.position}</p>}
              {customer.company && customer.customerType !== 'company' && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <p className="text-sm text-gray-500">{customer.company}</p>
                  </div>
                </div>
              )}
              {customer.cuit && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Hash className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-500">CUIT: {customer.cuit}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-600" />
                Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{customer.email}</p>
                  </div>
                </a>
              )}
              {customer.phone && (
                <a href={`tel:${cleanPhone(customer.phone)}`} className="flex min-h-11 touch-manipulation items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-gray-50">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Teléfono</p>
                    <p className="text-sm font-medium text-gray-900">{customer.phone}</p>
                  </div>
                </a>
              )}
              {customer.phone && (
                <a
                  href={whatsappUrl(customer.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 touch-manipulation items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-green-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">WhatsApp</p>
                    <p className="text-sm font-medium text-green-700">Abrir conversación</p>
                  </div>
                  <ExternalLink className="h-4 w-4 flex-shrink-0 text-green-500" />
                </a>
              )}
              {customerFullAddress ? (
                <div className={`rounded-lg ${hasCompleteAddress ? '' : 'bg-amber-50'}`}>
                  <a
                    href={mapsUrl(customerFullAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 touch-manipulation items-start gap-3 p-2.5 transition-colors hover:bg-amber-50"
                  >
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Dirección principal</p>
                    <p className="break-words text-sm font-medium text-gray-900">{customerFullAddress}</p>
                    {!hasCompleteAddress && <p className="mt-1 text-xs font-medium text-amber-700">Falta localidad o provincia</p>}
                  </div>
                  <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-amber-500" />
                  </a>
                  {!hasCompleteAddress && canEditCustomers && (
                    <Link to={`/customers/${customer.id}/edit`} className="flex min-h-10 touch-manipulation items-center justify-center border-t border-amber-200 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                      Completar dirección
                    </Link>
                  )}
                </div>
              ) : canEditCustomers ? (
                <Link to={`/customers/${customer.id}/edit`} className="flex min-h-11 touch-manipulation items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-2.5 text-red-700 hover:bg-red-100">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">Dirección principal</p>
                    <p className="text-sm font-semibold">Completar antes de agendar</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                </Link>
              ) : null}
            </CardContent>
          </Card>

          {/* Notes */}
          {customer.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Notas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dates */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Creado:</span>
                <span className="font-medium text-gray-700">{formatDate(customer.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Último contacto:</span>
                <span className="font-medium text-gray-700">{formatDate(customer.lastContact)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - History Tabs */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-3 sm:p-6">
              <Tabs defaultValue="timeline" className="w-full">
                <TabsList className="mb-4 flex h-11 w-full justify-start gap-1 overflow-x-auto p-1 sm:h-10">
                  <TabsTrigger value="timeline" className="min-w-[76px] flex-shrink-0 text-xs sm:text-sm">
                    <Clock className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
                    Todo
                  </TabsTrigger>
                  <TabsTrigger value="jobs" className="min-w-[112px] flex-shrink-0 text-xs sm:text-sm">
                    <Wrench className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
                    Trabajos
                    {customerJobs.length > 0 && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5">{customerJobs.length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="appointments" className="min-w-[104px] flex-shrink-0 text-xs sm:text-sm">
                    <Calendar className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
                    Turnos
                    {customerAppointments.length > 0 && (
                      <span className="ml-1 text-xs bg-purple-100 text-purple-700 rounded-full px-1.5">{customerAppointments.length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="finance" className="min-w-[112px] flex-shrink-0 text-xs sm:text-sm">
                    <DollarSign className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
                    Finanzas
                    {customerTransactions.length > 0 && (
                      <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 rounded-full px-1.5">{customerTransactions.length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="min-w-[96px] flex-shrink-0 text-xs sm:text-sm">
                    <StickyNote className="w-3.5 h-3.5 mr-1 hidden sm:inline-block" />
                    Notas
                    {customerNotes.length > 0 && (
                      <span className="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">{customerNotes.length}</span>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Timeline - All events */}
                <TabsContent value="timeline">
                  {timeline.length > 0 ? (
                    <div className="space-y-0">
                      {timeline.map(renderTimelineEvent)}
                    </div>
                  ) : (
                    renderEmptyState(Clock, 'No hay actividad registrada para este cliente')
                  )}
                </TabsContent>

                {/* Jobs */}
                <TabsContent value="jobs">
                  {customerJobs.length > 0 ? (
                    <div className="space-y-3">
                      {customerJobs.map(job => (
                        <div
                          key={job.id}
                          className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-100 rounded-lg transition-all ${canEditJobs ? 'hover:border-gray-200 hover:shadow-sm cursor-pointer' : ''}`}
                          onClick={() => canEditJobs && navigate(`/jobs/${job.id}/edit`)}
                        >
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                            <Wrench className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 text-sm sm:text-base">#{job.jobNumber}</p>
                              <Badge className={jobStatusColors[job.status]}>{jobStatusLabels[job.status]}</Badge>
                            </div>
                            <p className="text-sm text-gray-700 truncate">{job.title}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              <span>{formatDate(job.startDate)}</span>
                              {job.technicianNames?.length > 0 && (
                                <span>• {job.technicianNames.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {(job.totalAmount || job.budgetAmount) ? (
                              <p className="font-semibold text-gray-900 text-sm sm:text-base">
                                {formatCurrency(job.totalAmount || job.budgetAmount || 0, job.currency || 'ARS')}
                              </p>
                            ) : null}
                            {canEditJobs && <ChevronRight className="w-4 h-4 text-gray-400 ml-auto mt-1" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    renderEmptyState(
                      Wrench,
                      'No hay trabajos registrados para este cliente',
                      canCreateJobs ? 'Crear Trabajo' : undefined,
                      canCreateJobs ? `/jobs/new?clientId=${customer.id}` : undefined,
                    )
                  )}
                </TabsContent>

                {/* Appointments */}
                <TabsContent value="appointments">
                  {customerAppointments.length > 0 ? (
                    <div className="space-y-3">
                      {customerAppointments.map(apt => (
                        <div
                          key={apt.id}
                          className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-100 rounded-lg transition-all ${canEditAppointments ? 'hover:border-gray-200 hover:shadow-sm cursor-pointer' : ''}`}
                          onClick={() => canEditAppointments && navigate(`/calendar/${apt.id}/edit`)}
                        >
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                            <Calendar className="w-5 h-5 text-purple-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{apt.title}</p>
                              <Badge className={appointmentStatusColors[apt.status]}>{appointmentStatusLabels[apt.status]}</Badge>
                              {apt.recurrenceType && apt.recurrenceType !== 'none' && (
                                <span className="text-xs text-indigo-600 font-medium">⟳ Recurrente</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs sm:text-sm text-gray-500">
                              <span>{formatDate(apt.date)} a las {apt.time}hs</span>
                              <span>• {apt.duration} min</span>
                            </div>
                            {apt.address && (
                              <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
                                <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                <span className="break-words">{apt.address}</span>
                              </p>
                            )}
                            {apt.technicianNames?.length > 0 && (
                              <p className="text-xs text-gray-400 mt-0.5">{apt.technicianNames.join(', ')}</p>
                            )}
                            {apt.status === 'completed' && apt.completionNotes && (
                              <div className="mt-2 p-2 bg-emerald-50 rounded border border-emerald-100">
                                <p className="text-xs font-medium text-emerald-700">Notas de la visita:</p>
                                <p className="text-xs text-emerald-900 mt-0.5">{apt.completionNotes}</p>
                                {apt.completedBy && (
                                  <p className="text-xs text-emerald-600 mt-0.5">Por: {apt.completedBy}</p>
                                )}
                              </div>
                            )}
                          </div>
                          {canEditAppointments && <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  ) : (
                    renderEmptyState(
                      Calendar,
                      'No hay turnos registrados para este cliente',
                      canCreateAppointments ? 'Agendar Turno' : undefined,
                      canCreateAppointments ? `/calendar/new?clientId=${customer.id}` : undefined,
                    )
                  )}
                </TabsContent>

                {/* Finance */}
                <TabsContent value="finance">
                  {customerTransactions.length > 0 ? (
                    <div className="space-y-3">
                      {/* Mini summary */}
                      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-3 min-[420px]:grid-cols-3 sm:gap-3">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Ingresos</p>
                          <p className="text-sm sm:text-base font-bold text-emerald-600">
                            {formatCurrency(customerTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.totalAmount, 0))}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Gastos</p>
                          <p className="text-sm sm:text-base font-bold text-red-600">
                            {formatCurrency(customerTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.totalAmount, 0))}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Balance</p>
                          <p className="text-sm sm:text-base font-bold text-gray-900">
                            {formatCurrency(
                              customerTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.totalAmount, 0) -
                              customerTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.totalAmount, 0)
                            )}
                          </p>
                        </div>
                      </div>

                      {customerTransactions.map(txn => (
                        <div
                          key={txn.id}
                          className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-100 rounded-lg transition-all ${canEditTransactions ? 'hover:border-gray-200 hover:shadow-sm cursor-pointer' : ''}`}
                          onClick={() => canEditTransactions && navigate(`/finance/${txn.id}/edit`)}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            txn.type === 'income' ? 'bg-emerald-100' : 'bg-red-100'
                          }`}>
                            {txn.type === 'income' ? (
                              <TrendingUp className="w-5 h-5 text-emerald-600" />
                            ) : (
                              <TrendingDown className="w-5 h-5 text-red-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{txn.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                              <span>{formatDate(txn.date)}</span>
                              {txn.invoiceNumber && <span>• Fact. {txn.invoiceNumber}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-semibold text-sm sm:text-base ${txn.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {txn.type === 'expense' ? '-' : '+'}{formatCurrency(txn.totalAmount)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    renderEmptyState(
                      DollarSign,
                      'No hay transacciones registradas para este cliente',
                      canCreateTransactions ? 'Registrar Ingreso' : undefined,
                      canCreateTransactions ? `/finance/income/new?clientId=${customer.id}` : undefined,
                    )
                  )}
                </TabsContent>

                {/* Notes */}
                <TabsContent value="notes">
                  {customerNotes.length > 0 ? (
                    <div className="space-y-3">
                      {customerNotes.map(note => (
                        <div
                          key={note.id}
                          className={`p-3 sm:p-4 border border-gray-100 rounded-lg transition-all ${canEditNotes ? 'hover:border-gray-200 hover:shadow-sm cursor-pointer' : ''}`}
                          onClick={() => canEditNotes && navigate(`/notes/${note.id}/edit`)}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <StickyNote className="w-4 h-4 text-amber-600" />
                            <p className="font-medium text-gray-900 text-sm sm:text-base">{note.title}</p>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{note.content}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                            <span>{formatDate(note.createdAt)}</span>
                            <span>• {note.assignedToName}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    renderEmptyState(
                      StickyNote,
                      'No hay notas asociadas a este cliente',
                      canCreateNotes ? 'Crear Nota' : undefined,
                      canCreateNotes ? `/notes/new?clientId=${customer.id}` : undefined,
                    )
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen && canDeleteCustomers} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>¿Eliminar cliente?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Esta acción no se puede deshacer. Se eliminará permanentemente el cliente
                  <span className="font-semibold"> {customerDisplayName}</span>.
                </p>
                <p className="text-amber-600 text-sm font-medium">
                  ⚠️ Los trabajos y turnos asociados a este cliente no se eliminarán, pero quedarán sin cliente asignado.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
