import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  MapPin,
  User,
  Package,
  Phone,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Wrench,
  Grid3X3,
  List,
  CalendarDays,
  Clock,
  Columns3,
  Repeat2,
  MessageCircle,
  ExternalLink,
  History,
  Search,
  AlertTriangle,
  UserX,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Appointment } from '@/types/appointment';
import { APPOINTMENT_STATUS } from '@/types/appointment';

interface CalendarProps {
  appointments: Appointment[];
  technicians: Technician[];
  onDelete: (id: string) => void | Promise<void>;
  onStatusChange: (id: string, status: Appointment['status']) => void | Promise<void>;
  onComplete: (id: string, completionNotes: string, completedBy: string) => Promise<void>;
  currentUserName: string;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Colores para los estados de turno
const STATUS_COLORS = {
  pending: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', dot: 'bg-amber-500' },
  confirmed: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-700', dot: 'bg-red-500' },
};

// FIX 1: Helper para parsear fecha YYYY-MM-DD sin problemas de timezone
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Helper: obtener lunes de la semana de una fecha
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

// Helper: formatear fecha como YYYY-MM-DD (usando hora LOCAL, no UTC)
function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function clientFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'cliente';
}

function formatAppointmentEndTime(time: string, duration: number): string {
  const endMinutes = timeToMinutes(time) + duration;
  const hours = Math.floor(endMinutes / 60) % 24;
  const minutes = endMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildClientAppointmentConfirmation(appointment: Appointment): string {
  const date = parseLocalDate(appointment.date).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const endTime = formatAppointmentEndTime(appointment.time, appointment.duration);
  const lines = [
    `Hola ${clientFirstName(appointment.clientName)}! Te escribimos de INGEM.`,
    '',
    '*Confirmación de visita*',
    `🛠️ *Servicio:* ${appointment.title}`,
    `📅 *Fecha:* ${date}`,
    `🕒 *Horario estimado:* ${appointment.time} a ${endTime} hs`,
  ];

  if (appointment.address?.trim()) {
    lines.push(`📍 *Dirección:* ${appointment.address.trim()}`);
  }
  if (appointment.technicianNames.length > 0) {
    lines.push(`👷 *Técnico${appointment.technicianNames.length > 1 ? 's' : ''}:* ${appointment.technicianNames.join(', ')}`);
  }

  lines.push(
    '',
    'Por favor, respondé *CONFIRMO* para validar el turno.',
    'Si necesitás reprogramar, avisanos con anticipación. ¡Gracias!'
  );
  return lines.join('\n');
}

interface ScheduleConflict {
  id: string;
  date: string;
  technicianIds: string[];
  technicianNames: string[];
  first: Appointment;
  second: Appointment;
}

import { cleanPhone, whatsappUrl, mapsUrl } from '@/lib/contactUtils';
import { generateDayAgendaMessage, generateAppointmentMessage } from '@/lib/agendaMessage';
import type { Technician } from '@/types/technician';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

// FIX 7: Componente AppointmentCard extraído (antes repetido en 3 lugares)
interface AppointmentCardProps {
  appointment: Appointment;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  canEdit?: boolean;
  showDate?: boolean;
  compact?: boolean;
}

function AppointmentCard({ appointment, onClick, onEdit, canEdit = false, showDate = false, compact = false }: AppointmentCardProps) {
  const iconSize = compact ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div
      className={`
        ${compact ? 'p-2 sm:p-3' : 'p-4'} rounded-lg border-2 cursor-pointer transition-all hover:shadow-md
        ${STATUS_COLORS[appointment.status].bg} ${STATUS_COLORS[appointment.status].border}
        ${compact ? 'border-l-4' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`font-bold ${compact ? 'text-sm' : 'text-lg'}`}>{appointment.time}</span>
            {showDate && (
              <span className="text-sm text-slate-500">
                {parseLocalDate(appointment.date).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            )}
            <Badge className={`${compact ? 'text-xs' : ''} ${(APPOINTMENT_STATUS[appointment.status as keyof typeof APPOINTMENT_STATUS] ?? APPOINTMENT_STATUS.pending).color}`}>
              {(APPOINTMENT_STATUS[appointment.status as keyof typeof APPOINTMENT_STATUS] ?? APPOINTMENT_STATUS.pending).label}
            </Badge>
            {compact && <span className="text-xs text-slate-500">{appointment.duration} min</span>}
          </div>
          <h4 className={`font-semibold text-slate-800 ${compact ? 'text-sm' : ''} truncate flex items-center gap-1`}>
            {appointment.title}
            {appointment.recurrenceType && appointment.recurrenceType !== 'none' && (
              <span title="Turno recurrente"><Repeat2 className="w-3 h-3 text-indigo-500 flex-shrink-0" /></span>
            )}
          </h4>
          {/* FIX 6: Links clickeables */}
          <div className={`flex flex-wrap gap-x-3 gap-y-1 mt-1 ${textSize} text-slate-600`}>
            <span className="flex items-center gap-1">
              <User className={iconSize} />
              {appointment.clientName}
            </span>
            <a
              href={`tel:${cleanPhone(appointment.clientPhone)}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 hover:text-sky-600 transition-colors"
            >
              <Phone className={iconSize} />
              {appointment.clientPhone}
            </a>
            <a
              href={whatsappUrl(appointment.clientPhone)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-green-600 hover:text-green-700 transition-colors"
              title="WhatsApp"
            >
              <MessageCircle className={iconSize} />
              <span className="text-xs">WA</span>
            </a>
            <a
              href={mapsUrl(appointment.address)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 hover:text-sky-600 transition-colors"
            >
              <MapPin className={iconSize} />
              <span className="truncate max-w-[150px]">{appointment.address}</span>
            </a>
          </div>
          {appointment.technicianNames.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Wrench className={`${iconSize} text-slate-400`} />
              <div className="flex gap-1 flex-wrap">
                {appointment.technicianNames.map((tech, i) => (
                  <Badge key={i} variant="secondary" className={compact ? 'text-xs py-0' : 'text-xs'}>
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Editar turno ${appointment.title}`}
            className={`flex-shrink-0 touch-manipulation ${compact ? 'h-11 w-11 sm:h-8 sm:w-8' : ''}`}
            onClick={onEdit}
          >
            <Edit className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </Button>
        )}
      </div>
    </div>
  );
}

export function Calendar({ appointments, technicians, onDelete, onStatusChange, onComplete, currentUserName }: CalendarProps) {
  const navigate = useNavigate();
  const { canCreateEntity, canEditEntity, canDeleteEntity } = useAuth();
  const canCreateAppointments = canCreateEntity('appointments');
  const canEditAppointments = canEditEntity('appointments');
  const canDeleteAppointments = canDeleteEntity('appointments');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(formatDateStr(new Date()));
  const [viewMode, setViewMode] = useState<'year' | 'month' | 'week' | 'day' | 'list'>('month');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  // Completion notes dialog state
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completingAppointment, setCompletingAppointment] = useState<Appointment | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  // FIX 4: Estado para mostrar turnos anteriores en vista lista
  const [showPastAppointments, setShowPastAppointments] = useState(false);
  // Share day dialog state
  const [shareDayDialogOpen, setShareDayDialogOpen] = useState(false);
  const [shareSelectedTechnician, setShareSelectedTechnician] = useState<string>('all');
  // Filtros operativos
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Appointment['status']>('all');
  const [technicianFilter, setTechnicianFilter] = useState<string>('all');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayStr = formatDateStr(new Date());

  const visibleAppointments = useMemo(() => {
    const query = normalizeSearch(searchTerm);

    return appointments.filter(appointment => {
      if (statusFilter !== 'all' && appointment.status !== statusFilter) return false;

      if (technicianFilter === 'unassigned') {
        if ((appointment.technicianIds ?? []).length > 0) return false;
      } else if (technicianFilter !== 'all' && !(appointment.technicianIds ?? []).includes(technicianFilter)) {
        return false;
      }

      if (!query) return true;

      const searchableText = [
        appointment.title,
        appointment.clientName,
        appointment.clientPhone,
        appointment.address,
        appointment.description,
        appointment.notes,
        ...(appointment.technicianNames ?? []),
        ...(appointment.productNames ?? []),
      ].filter(Boolean).join(' ');

      return normalizeSearch(searchableText).includes(query);
    });
  }, [appointments, searchTerm, statusFilter, technicianFilter]);

  const hasActiveFilters = searchTerm.trim() !== '' || statusFilter !== 'all' || technicianFilter !== 'all';
  const activeFilterCount = [searchTerm.trim() !== '', statusFilter !== 'all', technicianFilter !== 'all']
    .filter(Boolean).length;

  const todayAppointments = useMemo(() =>
    appointments
      .filter(appointment => appointment.date === todayStr && appointment.status !== 'cancelled')
      .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, todayStr]
  );

  const todayPendingAppointments = useMemo(() =>
    todayAppointments.filter(appointment => appointment.status === 'pending'),
    [todayAppointments]
  );

  const todayUnassignedAppointments = useMemo(() =>
    todayAppointments.filter(appointment => (appointment.technicianIds ?? []).length === 0),
    [todayAppointments]
  );

  // Detectar cruces reales por fecha, horario y técnico compartido.
  const scheduleConflicts = useMemo<ScheduleConflict[]>(() => {
    const conflicts: ScheduleConflict[] = [];
    const appointmentsByDate = new Map<string, Appointment[]>();
    const technicianNamesById = new Map(
      technicians.map(technician => [technician.id, `${technician.firstName} ${technician.lastName}`.trim()])
    );

    appointments
      .filter(appointment =>
        appointment.date >= todayStr &&
        appointment.status !== 'cancelled' &&
        (appointment.technicianIds ?? []).length > 0
      )
      .forEach(appointment => {
        const dayAppointments = appointmentsByDate.get(appointment.date) ?? [];
        dayAppointments.push(appointment);
        appointmentsByDate.set(appointment.date, dayAppointments);
      });

    appointmentsByDate.forEach(dayAppointments => {
      const orderedAppointments = [...dayAppointments].sort((a, b) => a.time.localeCompare(b.time));

      for (let firstIndex = 0; firstIndex < orderedAppointments.length; firstIndex++) {
        const first = orderedAppointments[firstIndex];
        const firstStart = timeToMinutes(first.time);
        const firstEnd = firstStart + first.duration;

        for (let secondIndex = firstIndex + 1; secondIndex < orderedAppointments.length; secondIndex++) {
          const second = orderedAppointments[secondIndex];
          const secondStart = timeToMinutes(second.time);
          if (secondStart >= firstEnd) break;

          const secondEnd = secondStart + second.duration;
          const technicianIds = (first.technicianIds ?? [])
            .filter(technicianId => (second.technicianIds ?? []).includes(technicianId));

          if (technicianIds.length === 0 || firstStart >= secondEnd) continue;

          conflicts.push({
            id: `${first.date}-${first.id}-${second.id}`,
            date: first.date,
            technicianIds,
            technicianNames: technicianIds.map(technicianId => technicianNamesById.get(technicianId) ?? 'Técnico'),
            first,
            second,
          });
        }
      }
    });

    return conflicts.sort((a, b) =>
      a.date.localeCompare(b.date) || a.first.time.localeCompare(b.first.time)
    );
  }, [appointments, technicians, todayStr]);

  const todayWorkload = useMemo(() =>
    technicians
      .map(technician => {
        const technicianAppointments = todayAppointments.filter(appointment =>
          (appointment.technicianIds ?? []).includes(technician.id)
        );
        return {
          id: technician.id,
          name: `${technician.firstName} ${technician.lastName}`.trim(),
          appointmentCount: technicianAppointments.length,
          totalMinutes: technicianAppointments.reduce((total, appointment) => total + appointment.duration, 0),
        };
      })
      .filter(item => item.appointmentCount > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name)),
    [technicians, todayAppointments]
  );

  const totalTodayMinutes = todayAppointments.reduce((total, appointment) => total + appointment.duration, 0);

  // Semana actual (lunes a domingo)
  const weekDays = useMemo(() => {
    const monday = getMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        date: formatDateStr(d),
        day: d.getDate(),
        weekday: WEEKDAYS[d.getDay()],
        weekdayFull: WEEKDAYS_FULL[d.getDay()],
        month: MONTHS[d.getMonth()],
        isToday: formatDateStr(d) === formatDateStr(new Date()),
      };
    });
  }, [currentDate]);

  // FIX 3: Calcular rango horario dinámico según turnos visibles
  const getTimeSlots = (visibleDates: string[]): string[] => {
    let minHour = 7;
    let maxHour = 20;

    for (const apt of visibleAppointments) {
      if (visibleDates.includes(apt.date)) {
        const aptHour = parseInt(apt.time.split(':')[0]);
        if (aptHour < minHour) minHour = aptHour;
        if (aptHour > maxHour) maxHour = aptHour;
      }
    }

    const slots: string[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  // Generar datos para vista anual
  const getYearData = () => {
    const yearData: { month: number; appointments: Appointment[]; hasPending: boolean; hasConfirmed: boolean }[] = [];
    for (let m = 0; m < 12; m++) {
      const monthApps = visibleAppointments.filter(a => {
        const [aYear, aMonth] = a.date.split('-').map(Number);
        return aYear === year && (aMonth - 1) === m;
      });
      yearData.push({
        month: m,
        appointments: monthApps,
        hasPending: monthApps.some(a => a.status === 'pending'),
        hasConfirmed: monthApps.some(a => a.status === 'confirmed'),
      });
    }
    return yearData;
  };

  // Generar días del calendario mensual
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays: { date: string; day: number; isCurrentMonth: boolean }[] = [];

  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const date = formatDateStr(new Date(year, month - 1, day));
    calendarDays.push({ date, day, isCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDateStr(new Date(year, month, day));
    calendarDays.push({ date, day, isCurrentMonth: true });
  }

  const remainingDays = 42 - calendarDays.length;
  for (let day = 1; day <= remainingDays; day++) {
    const date = formatDateStr(new Date(year, month + 1, day));
    calendarDays.push({ date, day, isCurrentMonth: false });
  }

  // Turnos del día seleccionado
  const selectedDateAppointments = visibleAppointments
    .filter(a => a.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  // FIX 4: Turnos para vista lista - desde hoy en adelante por defecto
  const futureAppointments = useMemo(() =>
    [...visibleAppointments]
      .filter(a => (statusFilter === 'cancelled' || a.status !== 'cancelled') && a.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [visibleAppointments, todayStr, statusFilter]
  );
  const pastAppointments = useMemo(() =>
    [...visibleAppointments]
      .filter(a => (statusFilter === 'cancelled' || a.status !== 'cancelled') && a.date < todayStr)
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
    [visibleAppointments, todayStr, statusFilter]
  );

  const goToPrevious = () => {
    if (viewMode === 'year') {
      setCurrentDate(new Date(year - 1, 0, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else if (viewMode === 'day') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
      setSelectedDate(formatDateStr(d));
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };

  const goToNext = () => {
    if (viewMode === 'year') {
      setCurrentDate(new Date(year + 1, 0, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else if (viewMode === 'day') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
      setSelectedDate(formatDateStr(d));
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(formatDateStr(today));
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTechnicianFilter('all');
  };

  const focusDay = (
    date: string,
    nextStatusFilter: 'all' | Appointment['status'] = 'all',
    nextTechnicianFilter: string = 'all'
  ) => {
    setSearchTerm('');
    setStatusFilter(nextStatusFilter);
    setTechnicianFilter(nextTechnicianFilter);
    setCurrentDate(parseLocalDate(date));
    setSelectedDate(date);
    setViewMode('day');
  };

  const handleDelete = async () => {
    if (!appointmentToDelete || isDeleting) return;
    if (!canDeleteAppointments) {
      toast.error('No tenés permiso para eliminar turnos');
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(appointmentToDelete.id);
      setDeleteDialogOpen(false);
      setAppointmentToDelete(null);
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('No se pudo eliminar el turno. Probá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const changeAppointmentStatus = async (appointment: Appointment, status: Appointment['status']) => {
    if (isUpdatingStatus) return;
    if (!canEditAppointments) {
      toast.error('No tenés permiso para modificar turnos');
      return;
    }

    setIsUpdatingStatus(true);
    try {
      await onStatusChange(appointment.id, status);
      setSelectedAppointment(null);
    } catch (error) {
      console.error('Error updating appointment status:', error);
      toast.error('No se pudo actualizar el turno. Probá de nuevo.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const sendClientAppointmentConfirmation = (appointment: Appointment) => {
    if (!cleanPhone(appointment.clientPhone)) {
      toast.error('El cliente no tiene un teléfono cargado');
      return;
    }

    window.open(
      whatsappUrl(appointment.clientPhone, buildClientAppointmentConfirmation(appointment)),
      '_blank',
      'noopener,noreferrer'
    );
  };

  const getAppointmentsForDate = (date: string) => {
    return visibleAppointments.filter(a => a.date === date);
  };

  // FIX 5: Ignorar cancelados al elegir color del día (salvo que sean los únicos)
  const getDayColor = (dayAppts: Appointment[]) => {
    if (dayAppts.length === 0) return null;
    const nonCancelled = dayAppts.filter(a => a.status !== 'cancelled');
    if (nonCancelled.length === 0) {
      // Solo hay cancelados
      return STATUS_COLORS.cancelled;
    }
    if (nonCancelled.some(a => a.status === 'pending')) return STATUS_COLORS.pending;
    if (nonCancelled.some(a => a.status === 'confirmed')) return STATUS_COLORS.confirmed;
    return STATUS_COLORS.completed;
  };

  // Obtener turnos que caen en una franja horaria
  const getAppointmentsForSlot = (date: string, slotHour: string) => {
    const slotH = parseInt(slotHour.split(':')[0]);
    return visibleAppointments.filter(a => {
      if (a.date !== date) return false;
      const aptH = parseInt(a.time.split(':')[0]);
      return aptH === slotH;
    });
  };

  // Obtener título de navegación según vista
  const getNavigationTitle = () => {
    if (viewMode === 'year') return `${year}`;
    if (viewMode === 'month') return `${MONTHS[month]} ${year}`;
    if (viewMode === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.month === end.month) {
        return `${start.day} - ${end.day} ${start.month} ${year}`;
      }
      return `${start.day} ${start.month} - ${end.day} ${end.month}`;
    }
    if (viewMode === 'day') {
      const d = new Date(currentDate);
      return `${WEEKDAYS_FULL[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
    }
    return `${MONTHS[month]} ${year}`;
  };

  const yearData = getYearData();
  const today = formatDateStr(new Date());

  // ========== VISTAS ==========

  // Vista Anual
  const renderYearView = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
      {yearData.map((data, index) => (
        <button
          key={index}
          onClick={() => {
            setCurrentDate(new Date(year, data.month, 1));
            setViewMode('month');
          }}
          className={`
            p-4 rounded-xl border-2 text-left transition-all hover:shadow-lg
            ${data.appointments.length > 0 
              ? data.hasPending 
                ? 'bg-amber-50 border-amber-300 hover:border-amber-400' 
                : data.hasConfirmed
                  ? 'bg-blue-50 border-blue-300 hover:border-blue-400'
                  : 'bg-emerald-50 border-emerald-300 hover:border-emerald-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
            }
          `}
        >
          <h3 className="font-semibold text-sm sm:text-lg mb-1 sm:mb-2">{MONTHS[data.month]}</h3>
          <div className="space-y-1">
            <p className="text-xl sm:text-2xl font-bold">
              {data.appointments.length}
              <span className="text-sm font-normal text-slate-500 ml-1">turnos</span>
            </p>
            {data.appointments.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {data.hasPending && <span className="w-2 h-2 rounded-full bg-amber-500"></span>}
                {data.hasConfirmed && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                {data.appointments.some(a => a.status === 'completed') && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                )}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );

  // Vista Mensual
  const renderMonthView = () => (
    <>
      {/* Días de la semana */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Cuadrícula del calendario */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map(({ date, day, isCurrentMonth }) => {
          const dayAppointments = getAppointmentsForDate(date);
          const hasAppointments = dayAppointments.length > 0;
          const isSelected = selectedDate === date;
          const isToday = date === today;
          const dayColor = getDayColor(dayAppointments);

          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`
                aspect-square p-1 sm:p-2 rounded-lg text-left transition-all relative min-h-[48px] sm:min-h-[80px]
                ${isCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'}
                ${isSelected ? 'ring-2 ring-sky-500 ring-offset-2' : ''}
                ${isToday ? 'font-bold' : ''}
                ${hasAppointments && dayColor ? `${dayColor.bg} ${dayColor.border} border-2` : 'hover:bg-slate-100 border-2 border-transparent'}
              `}
            >
              <span className={`text-sm ${isToday ? 'text-sky-700' : hasAppointments && dayColor ? dayColor.text : ''}`}>
                {day}
              </span>
              {isToday && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-sky-500 rounded-full"></span>
              )}
              {hasAppointments && (
                <div className="absolute bottom-1 left-1 right-1">
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayAppointments.slice(0, 4).map((apt, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[apt.status].dot}`}
                      />
                    ))}
                  </div>
                  {dayAppointments.length > 0 && (
                    <p className="mt-0.5 hidden text-center text-xs text-slate-500 sm:block">
                      {dayAppointments.length} turno{dayAppointments.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-xs text-slate-600">Pendiente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-xs text-slate-600">Confirmado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-xs text-slate-600">Completado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-xs text-slate-600">Cancelado</span>
        </div>
      </div>
    </>
  );

  // Vista Semanal
  const renderWeekView = () => {
    const currentHour = new Date().getHours();
    // FIX 3: Rango horario dinámico
    const visibleDates = weekDays.map(wd => wd.date);
    const timeSlots = getTimeSlots(visibleDates);
    const startHour = parseInt(timeSlots[0].split(':')[0]);
    const endHour = parseInt(timeSlots[timeSlots.length - 1].split(':')[0]) + 1;

    return (
      <>
      {/* En celular la semana se muestra como agenda vertical, no como tabla de escritorio */}
      <div className="space-y-3 sm:hidden">
        {weekDays.map((wd) => {
          const dayAppointments = [...getAppointmentsForDate(wd.date)]
            .sort((a, b) => a.time.localeCompare(b.time));
          return (
            <Card key={wd.date} className={wd.isToday ? 'border-sky-300 bg-sky-50/40' : ''}>
              <CardContent className="p-3">
                <button
                  type="button"
                  className="flex min-h-11 w-full touch-manipulation items-center justify-between text-left"
                  onClick={() => {
                    setSelectedDate(wd.date);
                    setCurrentDate(parseLocalDate(wd.date));
                    setViewMode('day');
                  }}
                >
                  <div>
                    <p className={`text-sm font-semibold ${wd.isToday ? 'text-sky-700' : 'text-slate-800'}`}>
                      {wd.weekdayFull} {wd.day}
                    </p>
                    <p className="text-xs text-slate-500">{dayAppointments.length} turno{dayAppointments.length !== 1 ? 's' : ''}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </button>
                {dayAppointments.length > 0 ? (
                  <div className="mt-2 space-y-2 border-t pt-2">
                    {dayAppointments.map(appointment => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        compact
                        canEdit={canEditAppointments}
                        onClick={() => setSelectedAppointment(appointment)}
                        onEdit={(event) => {
                          event.stopPropagation();
                          navigate(`/calendar/${appointment.id}/edit`);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 border-t pt-2 text-xs text-slate-400">Sin turnos programados</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto sm:block sm:mx-0">
        <div className="min-w-[700px]">
          {/* Encabezado de días */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b sticky top-0 bg-white z-10">
            <div className="p-2 text-center text-xs text-slate-400">Hora</div>
            {weekDays.map((wd) => {
              const dayAppts = getAppointmentsForDate(wd.date);
              return (
                <button
                  key={wd.date}
                  onClick={() => {
                    setSelectedDate(wd.date);
                    // FIX 1: usar parseLocalDate en vez de new Date(string)
                    setCurrentDate(parseLocalDate(wd.date));
                    setViewMode('day');
                  }}
                  className={`
                    p-2 text-center border-l transition-colors hover:bg-slate-50
                    ${wd.isToday ? 'bg-sky-50' : ''}
                  `}
                >
                  <p className={`text-xs font-medium ${wd.isToday ? 'text-sky-600' : 'text-slate-500'}`}>
                    {wd.weekday}
                  </p>
                  <p className={`text-lg font-bold ${wd.isToday ? 'text-sky-700' : 'text-slate-800'}`}>
                    {wd.day}
                  </p>
                  {dayAppts.length > 0 && (
                    <div className="flex justify-center gap-0.5 mt-0.5">
                      {dayAppts.slice(0, 3).map((a, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[a.status].dot}`} />
                      ))}
                      {dayAppts.length > 3 && (
                        <span className="hidden text-xs text-slate-400 sm:inline">+{dayAppts.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Franjas horarias */}
          <div className="relative">
            {timeSlots.map((slot) => {
              const slotHour = parseInt(slot.split(':')[0]);
              const isCurrentHourSlot = slotHour === currentHour && weekDays.some(wd => wd.isToday);

              return (
                <div
                  key={slot}
                  className={`grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[60px] ${isCurrentHourSlot ? 'bg-sky-50/30' : ''}`}
                >
                  {/* Hora */}
                  <div className="p-1 text-right pr-2 text-xs text-slate-400 border-r">
                    {slot}
                  </div>

                  {/* Celdas por día */}
                  {weekDays.map((wd) => {
                    const slotAppts = getAppointmentsForSlot(wd.date, slot);
                    const isNow = wd.isToday && slotHour === currentHour;

                    return (
                      <div
                        key={`${wd.date}-${slot}`}
                        className={`
                          border-l p-0.5 relative cursor-pointer hover:bg-slate-50 transition-colors
                          ${isNow ? 'bg-sky-50' : ''}
                        `}
                        onClick={() => {
                          if (canCreateAppointments && slotAppts.length === 0) {
                            navigate('/calendar/new', { state: { date: wd.date, time: slot } });
                          }
                        }}
                      >
                        {slotAppts.map((apt) => (
                          <div
                            key={apt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppointment(apt);
                            }}
                            className={`
                              rounded px-1 py-0.5 mb-0.5 text-xs leading-tight cursor-pointer
                              border-l-2 transition-all hover:shadow-sm
                              ${STATUS_COLORS[apt.status].bg} ${STATUS_COLORS[apt.status].border}
                            `}
                            title={`${apt.time} - ${apt.title} (${apt.clientName})`}
                          >
                            <p className="font-semibold truncate flex items-center gap-1">
                              {apt.time} {apt.title}
                              {apt.recurrenceType && apt.recurrenceType !== 'none' && (
                                <span title="Turno recurrente"><Repeat2 className="w-3 h-3 text-indigo-500 flex-shrink-0" /></span>
                              )}
                            </p>
                            <p className="truncate text-slate-600">{apt.clientName}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Línea de hora actual */}
            {weekDays.some(wd => wd.isToday) && (() => {
              const now = new Date();
              const currentMinutes = now.getHours() * 60 + now.getMinutes();
              const startMinutes = startHour * 60;
              const endMinutes = endHour * 60;
              if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                const percentage = ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100;
                return (
                  <div
                    className="absolute left-[60px] right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
                    style={{ top: `${percentage}%` }}
                  >
                    <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>
      </>
    );
  };

  // Vista Diaria
  const renderDayView = () => {
    const dayStr = formatDateStr(currentDate);
    const dayAppts = visibleAppointments
      .filter(a => a.date === dayStr)
      .sort((a, b) => a.time.localeCompare(b.time));
    const currentHour = new Date().getHours();
    const isToday = dayStr === formatDateStr(new Date());

    // FIX 3: Rango horario dinámico para vista diaria
    const timeSlots = getTimeSlots([dayStr]);
    const startHour = parseInt(timeSlots[0].split(':')[0]);
    const endHour = parseInt(timeSlots[timeSlots.length - 1].split(':')[0]) + 1;

    return (
      <div className="space-y-0">
        {/* Resumen del día */}
        <div className="mb-4 flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">
              {dayAppts.length} turno{dayAppts.length !== 1 ? 's' : ''} programado{dayAppts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 touch-manipulation"
              onClick={() => {
                setShareSelectedTechnician('all');
                setShareDayDialogOpen(true);
              }}
            >
              <MessageCircle className="w-4 h-4 mr-1" />
              Compartir día
            </Button>
            {canCreateAppointments && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 touch-manipulation"
                onClick={() => navigate('/calendar/new', { state: { date: dayStr } })}
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar turno
              </Button>
            )}
          </div>
        </div>
        {/* Franjas horarias */}
        <div className="relative">
          {timeSlots.map((slot) => {
            const slotHour = parseInt(slot.split(':')[0]);
            const slotAppts = getAppointmentsForSlot(dayStr, slot);
            const isNow = isToday && slotHour === currentHour;

            return (
              <div
                key={slot}
                className={`
                  flex border-b min-h-[70px] transition-colors
                  ${isNow ? 'bg-sky-50' : 'hover:bg-slate-50'}
                `}
              >
                {/* Hora */}
                <div className={`w-16 sm:w-20 flex-shrink-0 p-2 text-right pr-3 border-r ${isNow ? 'text-sky-700 font-bold' : 'text-slate-400'}`}>
                  <span className="text-sm">{slot}</span>
                  {isNow && <div className="w-2 h-2 bg-red-500 rounded-full ml-auto mt-1" />}
                </div>

                {/* Contenido */}
                <div className="flex-1 p-1 sm:p-2">
                  {slotAppts.length > 0 ? (
                    <div className="space-y-1">
                      {slotAppts.map((apt) => (
                        <AppointmentCard
                          key={apt.id}
                          appointment={apt}
                          compact
                          canEdit={canEditAppointments}
                          onClick={() => setSelectedAppointment(apt)}
                          onEdit={(e) => {
                            e.stopPropagation();
                            navigate(`/calendar/${apt.id}/edit`);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`h-full flex items-center justify-center text-slate-300 rounded transition-colors ${canCreateAppointments ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                      onClick={() => canCreateAppointments && navigate('/calendar/new', { state: { date: dayStr, time: slot } })}
                    >
                      {canCreateAppointments && <Plus className="w-4 h-4" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Línea de hora actual */}
          {isToday && (() => {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const startMinutes = startHour * 60;
            const endMinutes = endHour * 60;
            if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
              const percentage = ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100;
              return (
                <div
                  className="absolute left-16 sm:left-20 right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{ top: `${percentage}%` }}
                >
                  <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    );
  };

  // FIX 4: Vista de Lista - desde hoy con botón "Ver anteriores"
  const renderListView = () => (
    <div className="space-y-3">
      {/* Botón para ver turnos anteriores */}
      {pastAppointments.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowPastAppointments(!showPastAppointments)}
        >
          <History className="w-4 h-4 mr-2" />
          {showPastAppointments ? 'Ocultar anteriores' : `Ver anteriores (${pastAppointments.length})`}
        </Button>
      )}

      {/* Turnos anteriores (si se muestran) */}
      {showPastAppointments && pastAppointments.length > 0 && (
        <div className="space-y-2 opacity-75">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Anteriores</p>
          {pastAppointments.map((apt) => (
            <AppointmentCard
              key={apt.id}
              appointment={apt}
              showDate
              canEdit={canEditAppointments}
              onClick={() => setSelectedAppointment(apt)}
              onEdit={(e) => {
                e.stopPropagation();
                navigate(`/calendar/${apt.id}/edit`);
              }}
            />
          ))}
          <div className="border-b my-3" />
        </div>
      )}

      {/* Turnos desde hoy */}
      {futureAppointments.length === 0 && !showPastAppointments ? (
        <div className="text-center py-8 text-slate-500">
          <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No hay turnos próximos programados</p>
        </div>
      ) : (
        <>
          {futureAppointments.length > 0 && (
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Próximos</p>
          )}
          {futureAppointments.map((apt) => (
            <AppointmentCard
              key={apt.id}
              appointment={apt}
              showDate
              canEdit={canEditAppointments}
              onClick={() => setSelectedAppointment(apt)}
              onEdit={(e) => {
                e.stopPropagation();
                navigate(`/calendar/${apt.id}/edit`);
              }}
            />
          ))}
        </>
      )}
    </div>
  );

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Agenda / Calendario</h1>
          <p className="text-slate-500">
            {hasActiveFilters
              ? `${visibleAppointments.length} de ${appointments.length} turnos visibles`
              : `${appointments.length} turnos programados`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-11 touch-manipulation sm:min-h-11" onClick={goToToday}>
            <CalendarIcon className="w-4 h-4 mr-2" />
            Hoy
          </Button>
          {canCreateAppointments && (
            <Button 
              className="min-h-11 touch-manipulation bg-sky-600 hover:bg-sky-700 sm:min-h-11"
              onClick={() => navigate('/calendar/new')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Turno
            </Button>
          )}
        </div>
      </div>

      {/* Control operativo del día */}
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-1 bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Control de hoy</p>
              <p className="text-xs capitalize text-slate-300">
                {parseLocalDate(todayStr).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <p className="text-xs text-slate-300">
              {todayAppointments.length > 0 ? `${formatDuration(totalTodayMinutes)} planificadas` : 'Sin carga planificada'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
            <button
              type="button"
              className="min-h-24 bg-white p-3 text-left transition-colors hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:p-4"
              onClick={() => focusDay(todayStr)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-lg bg-sky-100 p-2 text-sky-700"><CalendarDays className="h-4 w-4" /></span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{todayAppointments.length}</p>
              <p className="text-xs text-slate-500">Turnos de hoy</p>
            </button>

            <button
              type="button"
              className="min-h-24 bg-white p-3 text-left transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 sm:p-4"
              onClick={() => focusDay(todayStr, 'pending')}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-lg bg-amber-100 p-2 text-amber-700"><Clock className="h-4 w-4" /></span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
              <p className="text-2xl font-bold text-amber-700">{todayPendingAppointments.length}</p>
              <p className="text-xs text-slate-500">Sin confirmar hoy</p>
            </button>

            <button
              type="button"
              className="min-h-24 bg-white p-3 text-left transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 sm:p-4"
              onClick={() => focusDay(todayStr, 'all', 'unassigned')}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-lg bg-violet-100 p-2 text-violet-700"><UserX className="h-4 w-4" /></span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
              <p className="text-2xl font-bold text-violet-700">{todayUnassignedAppointments.length}</p>
              <p className="text-xs text-slate-500">Sin técnico hoy</p>
            </button>

            <button
              type="button"
              className="min-h-24 bg-white p-3 text-left transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 sm:p-4"
              onClick={() => {
                const firstConflict = scheduleConflicts[0];
                focusDay(firstConflict?.date ?? todayStr, 'all', firstConflict?.technicianIds[0] ?? 'all');
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-lg bg-red-100 p-2 text-red-700"><AlertTriangle className="h-4 w-4" /></span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
              <p className="text-2xl font-bold text-red-700">{scheduleConflicts.length}</p>
              <p className="text-xs text-slate-500">Cruces próximos</p>
            </button>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Carga del equipo</p>
                <p className="text-xs text-slate-500">Tocá un técnico para ver su agenda de hoy</p>
              </div>
              <Badge variant="secondary">{todayWorkload.length} con turnos</Badge>
            </div>
            {todayWorkload.length > 0 ? (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {todayWorkload.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="min-h-11 min-w-[150px] flex-shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50"
                    onClick={() => focusDay(todayStr, 'all', item.id)}
                  >
                    <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.appointmentCount} turno{item.appointmentCount !== 1 ? 's' : ''} · {formatDuration(item.totalMinutes)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500">
                Todavía no hay turnos asignados al equipo para hoy.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conflictos que necesitan revisión */}
      {scheduleConflicts.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-3 sm:p-4">
            <div className="mb-3 flex items-start gap-3">
              <span className="rounded-lg bg-red-100 p-2 text-red-700"><AlertTriangle className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-red-900">Revisar cruces de agenda</p>
                <p className="text-xs text-red-700">Dos turnos ocupan al mismo técnico al mismo tiempo.</p>
              </div>
              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{scheduleConflicts.length}</Badge>
            </div>
            <div className="space-y-2">
              {scheduleConflicts.slice(0, 3).map(conflict => (
                <button
                  key={conflict.id}
                  type="button"
                  className="flex min-h-11 w-full items-start gap-3 rounded-lg border border-red-100 bg-white p-3 text-left transition-colors hover:border-red-300 hover:bg-red-50"
                  onClick={() => focusDay(conflict.date, 'all', conflict.technicianIds[0] ?? 'all')}
                >
                  <div className="min-w-[62px] flex-shrink-0">
                    <p className="text-xs font-semibold uppercase text-red-700">
                      {parseLocalDate(conflict.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-xs text-slate-500">{conflict.first.time}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{conflict.technicianNames.join(', ')}</p>
                    <p className="line-clamp-2 text-xs text-slate-600">
                      {conflict.first.title} y {conflict.second.title}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-400" />
                </button>
              ))}
              {scheduleConflicts.length > 3 && (
                <p className="text-center text-xs text-red-700">Hay {scheduleConflicts.length - 3} cruces más para revisar.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Búsqueda y filtros */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Buscar y filtrar agenda</p>
              <p className="text-xs text-slate-500">Cliente, dirección, trabajo, estado o técnico</p>
            </div>
            {activeFilterCount > 0 && (
              <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">
                {activeFilterCount} filtro{activeFilterCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-[minmax(240px,1fr)_180px_220px_auto]">
            <div className="relative col-span-2 min-w-0 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Buscar cliente, dirección o trabajo"
                aria-label="Buscar turnos"
                className="min-h-11 w-full pl-9 text-base sm:text-sm"
              />
            </div>

            <Select value={statusFilter} onValueChange={value => setStatusFilter(value as 'all' | Appointment['status'])}>
              <SelectTrigger className="min-h-11 w-full text-base sm:text-sm" aria-label="Filtrar por estado">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="completed">Completados</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>

            <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
              <SelectTrigger className="min-h-11 w-full text-base sm:text-sm" aria-label="Filtrar por técnico">
                <SelectValue placeholder="Todos los técnicos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los técnicos</SelectItem>
                <SelectItem value="unassigned">Sin técnico asignado</SelectItem>
                {technicians.map(technician => (
                  <SelectItem key={technician.id} value={technician.id}>
                    {technician.firstName} {technician.lastName}{technician.isActive ? '' : ' (inactivo)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              className="col-span-2 min-h-11 w-full touch-manipulation lg:col-span-1 lg:w-auto"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Selector de Vista */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full min-w-0 sm:w-auto">
          <TabsList className="flex h-11 w-full justify-start gap-1 overflow-x-auto p-1 sm:h-10 sm:w-auto">
            <TabsTrigger value="year" className="min-w-[72px] flex-shrink-0 gap-1 text-xs sm:text-sm">
              <Grid3X3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Año</span>
            </TabsTrigger>
            <TabsTrigger value="month" className="min-w-[72px] flex-shrink-0 gap-1 text-xs sm:text-sm">
              <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Mes</span>
            </TabsTrigger>
            <TabsTrigger value="week" className="min-w-[88px] flex-shrink-0 gap-1 text-xs sm:text-sm">
              <Columns3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Semana</span>
            </TabsTrigger>
            <TabsTrigger value="day" className="min-w-[72px] flex-shrink-0 gap-1 text-xs sm:text-sm">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Día</span>
            </TabsTrigger>
            <TabsTrigger value="list" className="min-w-[76px] flex-shrink-0 gap-1 text-xs sm:text-sm">
              <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Lista</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Navegación */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation" aria-label="Anterior" onClick={goToPrevious}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-sm sm:text-xl font-semibold min-w-[120px] sm:min-w-[200px] text-center">
            {getNavigationTitle()}
          </h2>
          <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation" aria-label="Siguiente" onClick={goToNext}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Contenido según vista */}
      <Card>
        <CardContent className="p-2 sm:p-6">
          {hasActiveFilters && visibleAppointments.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg bg-slate-50 px-4 py-10 text-center">
              <Search className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-semibold text-slate-700">No encontramos turnos con esos filtros</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Probá otra búsqueda o limpiá los filtros para volver a ver toda la agenda.</p>
              <Button type="button" variant="outline" className="mt-4 min-h-11 touch-manipulation" onClick={clearFilters}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <>
              {viewMode === 'year' && renderYearView()}
              {viewMode === 'month' && renderMonthView()}
              {viewMode === 'week' && renderWeekView()}
              {viewMode === 'day' && renderDayView()}
              {viewMode === 'list' && renderListView()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Listado de turnos del día seleccionado (solo en vista mes) */}
      {viewMode === 'month' && (!hasActiveFilters || visibleAppointments.length > 0) && (
        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base sm:text-lg font-semibold">
                {/* FIX 1: usar parseLocalDate */}
                Turnos del {parseLocalDate(selectedDate).toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h3>
              {canCreateAppointments && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
                  onClick={() => navigate('/calendar/new', { state: { date: selectedDate } })}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar
                </Button>
              )}
            </div>

            {selectedDateAppointments.length === 0 ? (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>{hasActiveFilters ? 'No hay turnos que coincidan con los filtros para este día' : 'No hay turnos para este día'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDateAppointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    canEdit={canEditAppointments}
                    onClick={() => setSelectedAppointment(appointment)}
                    onEdit={(e) => {
                      e.stopPropagation();
                      navigate(`/calendar/${appointment.id}/edit`);
                    }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detalle del turno seleccionado */}
      <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{selectedAppointment?.title}</DialogTitle>
            <DialogDescription>
              {/* FIX 1: usar parseLocalDate */}
              {selectedAppointment && parseLocalDate(selectedAppointment.date).toLocaleDateString('es-AR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </DialogDescription>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={(APPOINTMENT_STATUS[selectedAppointment.status as keyof typeof APPOINTMENT_STATUS] ?? APPOINTMENT_STATUS.pending).color}>
                  {(APPOINTMENT_STATUS[selectedAppointment.status as keyof typeof APPOINTMENT_STATUS] ?? APPOINTMENT_STATUS.pending).label}
                </Badge>
                <span className="text-sm text-slate-500">
                  {selectedAppointment.time} ({selectedAppointment.duration} min)
                </span>
              </div>

              {/* FIX 6: Links clickeables en detalle */}
              <div className="space-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  <User className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <span className="break-words">{selectedAppointment.clientName}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Phone className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <a href={`tel:${cleanPhone(selectedAppointment.clientPhone)}`} className="hover:text-sky-600 transition-colors">
                    {selectedAppointment.clientPhone}
                  </a>
                  <a
                    href={whatsappUrl(selectedAppointment.clientPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 text-sm text-green-600 hover:text-green-700 bg-green-50 px-3 py-1 rounded-full transition-colors touch-manipulation"
                  >
                    <MessageCircle className="w-3 h-3" />
                    WhatsApp
                  </a>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 w-4 h-4 flex-shrink-0 text-slate-400" />
                  <a
                    href={mapsUrl(selectedAppointment.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 break-words hover:text-sky-600 transition-colors flex items-start gap-1"
                  >
                    {selectedAppointment.address}
                    <ExternalLink className="mt-0.5 w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
              </div>

              {selectedAppointment.technicianNames.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2">Técnicos asignados:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAppointment.technicianNames.map((tech, i) => (
                      <Badge key={i} variant="secondary" className="bg-sky-100 text-sky-700">
                        <Wrench className="w-3 h-3 mr-1" />
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedAppointment.productNames.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2">Equipos:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAppointment.productNames.map((product, i) => (
                      <Badge key={i} variant="secondary">
                        <Package className="w-3 h-3 mr-1" />
                        {product}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedAppointment.description && (
                <div>
                  <p className="text-sm font-medium text-slate-500">Descripción:</p>
                  <p className="text-sm">{selectedAppointment.description}</p>
                </div>
              )}

              {selectedAppointment.notes && (
                <div>
                  <p className="text-sm font-medium text-slate-500">Notas:</p>
                  <p className="text-sm">{selectedAppointment.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 flex-wrap">
                {(selectedAppointment.status === 'pending' || selectedAppointment.status === 'confirmed') && (
                  <Button
                    type="button"
                    className="min-h-11 w-full touch-manipulation bg-green-600 text-white hover:bg-green-700"
                    onClick={() => sendClientAppointmentConfirmation(selectedAppointment)}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Enviar confirmación al cliente
                  </Button>
                )}
                {/* Botón Enviar a técnico */}
                <Button
                  variant="outline"
                  className="min-h-11 flex-1 touch-manipulation border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => {
                    if (!selectedAppointment) return;
                    const msg = generateAppointmentMessage(selectedAppointment);
                    const assignedTechs = technicians.filter(t => selectedAppointment.technicianIds.includes(t.id));
                    if (assignedTechs.length === 1 && assignedTechs[0].phone) {
                      window.open(whatsappUrl(assignedTechs[0].phone, msg), '_blank');
                    } else if (assignedTechs.length > 1) {
                      // Multiple techs: use share
                      if (navigator.share) {
                        navigator.share({ text: msg }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(msg);
                        toast.success('Mensaje copiado al portapapeles');
                      }
                    } else {
                      // No tech assigned: use share
                      if (navigator.share) {
                        navigator.share({ text: msg }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(msg);
                        toast.success('Mensaje copiado al portapapeles');
                      }
                    }
                  }}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Enviar a técnico
                </Button>
                {/* FIX 2: Botón Confirmar cuando status === 'pending' */}
                {canEditAppointments && selectedAppointment.status === 'pending' && (
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 touch-manipulation border-blue-300 text-blue-700 hover:bg-blue-50"
                    disabled={isUpdatingStatus}
                    onClick={() => changeAppointmentStatus(selectedAppointment, 'confirmed')}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Confirmar
                  </Button>
                )}
                {canEditAppointments && selectedAppointment.status !== 'completed' && (
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 touch-manipulation"
                    onClick={() => {
                      setCompletingAppointment(selectedAppointment);
                      setCompletionNotes('');
                      setSelectedAppointment(null);
                      setCompletionDialogOpen(true);
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Completar
                  </Button>
                )}
                {selectedAppointment.status === 'completed' && selectedAppointment.completionNotes && (
                  <div className="w-full mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-xs font-medium text-emerald-700 mb-1">Notas de la visita:</p>
                    <p className="text-sm text-emerald-900">{selectedAppointment.completionNotes}</p>
                    {selectedAppointment.completedBy && (
                      <p className="text-xs text-emerald-600 mt-1">Completado por: {selectedAppointment.completedBy}</p>
                    )}
                  </div>
                )}
                {canEditAppointments && selectedAppointment.status !== 'cancelled' && (
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 touch-manipulation"
                    disabled={isUpdatingStatus}
                    onClick={() => changeAppointmentStatus(selectedAppointment, 'cancelled')}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                )}
                {canEditAppointments && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Editar turno"
                    className="min-h-11 min-w-11 touch-manipulation"
                    onClick={() => navigate(`/calendar/${selectedAppointment.id}/edit`)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
                {canDeleteAppointments && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Eliminar turno"
                    className="min-h-11 min-w-11 touch-manipulation text-red-500"
                    onClick={() => {
                      setAppointmentToDelete(selectedAppointment);
                      setSelectedAppointment(null);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de eliminación */}
      <Dialog open={deleteDialogOpen && canDeleteAppointments} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eliminar turno</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar el turno <strong>{appointmentToDelete?.title}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting || !canDeleteAppointments}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de notas post-visita */}
      <Dialog open={completionDialogOpen && canEditAppointments} onOpenChange={(open) => {
        if (!open) {
          setCompletionDialogOpen(false);
          setCompletingAppointment(null);
          setCompletionNotes('');
        }
      }}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Completar turno
            </DialogTitle>
            <DialogDescription>
              Registrá qué se hizo en la visita para <strong>{completingAppointment?.title}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-slate-50 p-3 rounded-lg text-sm">
              <p><strong>Cliente:</strong> {completingAppointment?.clientName}</p>
              <p><strong>Fecha:</strong> {completingAppointment?.date} - {completingAppointment?.time}</p>
              {completingAppointment?.address && <p><strong>Dirección:</strong> {completingAppointment.address}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Notas de la visita *</label>
              <Textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Ej: Se instaló equipo Split 3000 frig, se verificó funcionamiento, cliente conforme..."
                rows={4}
                className="min-h-28 resize-none text-base sm:text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">Detallá el trabajo realizado, observaciones, y si quedó algo pendiente</p>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-20 -mx-4 -mb-4 flex-col gap-2 border-t border-slate-200/80 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:-mx-6 sm:-mb-6 sm:flex-row sm:px-6">
            <Button type="button" variant="outline" className="min-h-11 touch-manipulation" disabled={isCompleting} onClick={() => {
              setCompletionDialogOpen(false);
              setCompletingAppointment(null);
              setCompletionNotes('');
            }}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-11 touch-manipulation bg-emerald-600 hover:bg-emerald-700"
              disabled={!completionNotes.trim() || isCompleting}
              onClick={async () => {
                if (!completingAppointment || !completionNotes.trim()) return;
                if (!canEditAppointments) {
                  toast.error('No tenés permiso para completar turnos');
                  return;
                }
                setIsCompleting(true);
                try {
                  await onComplete(completingAppointment.id, completionNotes.trim(), currentUserName);
                  setCompletionDialogOpen(false);
                  setCompletingAppointment(null);
                  setCompletionNotes('');
                } catch (err) {
                  console.error('Error completing appointment:', err);
                  toast.error('No se pudo completar el turno. Probá de nuevo.');
                } finally {
                  setIsCompleting(false);
                }
              }}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {isCompleting ? 'Guardando...' : 'Completar turno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Compartir día */}
      <Dialog open={shareDayDialogOpen} onOpenChange={setShareDayDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Compartir agenda del día</DialogTitle>
            <DialogDescription>
              Enviá la agenda a un técnico por WhatsApp o compartila.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Técnico</label>
              <Select value={shareSelectedTechnician} onValueChange={setShareSelectedTechnician}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar técnico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los turnos</SelectItem>
                  {technicians.filter(t => t.isActive).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Vista previa</label>
              <pre className="text-xs bg-slate-50 border rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans">
                {(() => {
                  const dateStr = viewMode === 'day' ? formatDateStr(currentDate) : selectedDate;
                  const tech = technicians.find(t => t.id === shareSelectedTechnician);
                  const techName = tech ? tech.firstName : 'equipo';
                  return generateDayAgendaMessage(dateStr, appointments, techName, shareSelectedTechnician === 'all' ? undefined : shareSelectedTechnician);
                })()}
              </pre>
            </div>
            <div className="flex gap-2 flex-wrap">
              {shareSelectedTechnician !== 'all' && (() => {
                const tech = technicians.find(t => t.id === shareSelectedTechnician);
                if (!tech || !tech.phone) return null;
                const dateStr = viewMode === 'day' ? formatDateStr(currentDate) : selectedDate;
                const msg = generateDayAgendaMessage(dateStr, appointments, tech.firstName, tech.id);
                return (
                  <Button
                    className="bg-green-600 hover:bg-green-700 flex-1"
                    onClick={() => {
                      window.open(whatsappUrl(tech.phone, msg), '_blank');
                    }}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    WhatsApp
                  </Button>
                );
              })()}
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  const dateStr = viewMode === 'day' ? formatDateStr(currentDate) : selectedDate;
                  const tech = technicians.find(t => t.id === shareSelectedTechnician);
                  const techName = tech ? tech.firstName : 'equipo';
                  const msg = generateDayAgendaMessage(dateStr, appointments, techName, shareSelectedTechnician === 'all' ? undefined : shareSelectedTechnician);
                  if (navigator.share) {
                    try {
                      await navigator.share({ text: msg });
                    } catch (e) {
                      // User cancelled
                    }
                  } else {
                    await navigator.clipboard.writeText(msg);
                    toast.success('Mensaje copiado al portapapeles');
                  }
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Compartir
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  const dateStr = viewMode === 'day' ? formatDateStr(currentDate) : selectedDate;
                  const tech = technicians.find(t => t.id === shareSelectedTechnician);
                  const techName = tech ? tech.firstName : 'equipo';
                  const msg = generateDayAgendaMessage(dateStr, appointments, techName, shareSelectedTechnician === 'all' ? undefined : shareSelectedTechnician);
                  await navigator.clipboard.writeText(msg);
                  toast.success('Mensaje copiado al portapapeles');
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
