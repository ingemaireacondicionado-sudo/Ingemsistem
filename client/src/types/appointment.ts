export interface Appointment {
  id: string;
  title: string;
  description: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  productIds: string[];
  productNames: string[];
  technicianIds: string[];
  technicianNames: string[];
  date: string;
  time: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  address: string;
  notes: string;
  // Recurrence fields
  recurrenceType: 'none' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  recurrenceEndDate: string | null;
  parentAppointmentId: string | null;
  recurrenceGroupId: string | null;
  // Completion fields
  completionNotes: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentFormData {
  title: string;
  description: string;
  clientId: string;
  productIds: string[];
  technicianIds: string[];
  date: string;
  time: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  address: string;
  notes: string;
  recurrenceType: 'none' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  recurrenceEndDate: string;
}

export const APPOINTMENT_STATUS = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmado', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completado', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

export const DURATION_OPTIONS = [
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1 hora 30 min' },
  { value: 120, label: '2 horas' },
  { value: 180, label: '3 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas (dia completo)' },
];

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Sin repetición' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Cada 3 meses' },
];
