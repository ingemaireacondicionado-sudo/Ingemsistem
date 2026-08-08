import { useCallback, useMemo } from 'react';
import type { Appointment, AppointmentFormData } from '@/types/appointment';
import { trpc } from '@/lib/trpc';

export function useAppointments() {
  const q = trpc.appointments.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.appointments.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.appointments.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.appointments.delete.useMutation({ onSuccess: () => q.refetch() });
  const completeM = trpc.appointments.complete.useMutation({ onSuccess: () => q.refetch() });
  const deleteGroupM = trpc.appointments.deleteRecurrenceGroup.useMutation({ onSuccess: () => q.refetch() });

  const appointments: Appointment[] = useMemo(() =>
    (q.data ?? []).map((a: any) => ({
      id: String(a.id), title: a.title ?? '', description: a.description ?? '',
      clientId: a.customerId ? String(a.customerId) : '',
      clientName: a.clientName ?? '', clientPhone: a.clientPhone ?? '',
      productIds: tryParse(a.productIds, []),
      productNames: tryParse(a.productNames, []),
      technicianIds: tryParse(a.technicianIds, []),
      technicianNames: tryParse(a.technicianNames, []),
      date: a.date ?? '', time: a.time ?? '', duration: parseInt(a.endTime) || 60,
      status: a.status ?? 'pending', address: a.address ?? '', notes: a.notes ?? '',
      // Recurrence fields
      recurrenceType: a.recurrenceType ?? 'none',
      recurrenceEndDate: a.recurrenceEndDate ?? null,
      parentAppointmentId: a.parentAppointmentId ? String(a.parentAppointmentId) : null,
      recurrenceGroupId: a.recurrenceGroupId ?? null,
      // Completion fields
      completionNotes: a.completionNotes ?? null,
      completedBy: a.completedBy ?? null,
      completedAt: a.completedAt ? _toLocal(new Date(a.completedAt)) : null,
      createdAt: a.createdAt ? _toLocal(new Date(a.createdAt)) : '',
      updatedAt: a.updatedAt ? _toLocal(new Date(a.updatedAt)) : '',
    })), [q.data]);

  const addAppointment = useCallback(async (data: AppointmentFormData, clientName: string, clientPhone: string, productNames: string[], technicianNames: string[]): Promise<string> => {
    const result = await cM.mutateAsync({
      title: data.title, description: data.description, date: data.date,
      time: data.time, endTime: String(data.duration), status: data.status,
      customerId: data.clientId ? parseInt(data.clientId) : null,
      clientName, clientPhone,
      technicianIds: JSON.stringify(data.technicianIds),
      technicianNames: JSON.stringify(technicianNames),
      productIds: JSON.stringify(data.productIds),
      productNames: JSON.stringify(productNames),
      address: data.address, notes: data.notes,
      recurrenceType: data.recurrenceType ?? 'none',
      recurrenceEndDate: data.recurrenceEndDate || undefined,
    });
    return String(result.id);
  }, [cM]);

  const updateAppointment = useCallback(async (id: string, data: AppointmentFormData, clientName: string, clientPhone: string, productNames: string[], technicianNames: string[]) => {
    await uM.mutateAsync({
      id: parseInt(id), title: data.title, description: data.description,
      date: data.date, time: data.time, endTime: String(data.duration), status: data.status,
      customerId: data.clientId ? parseInt(data.clientId) : null,
      clientName, clientPhone,
      technicianIds: JSON.stringify(data.technicianIds),
      technicianNames: JSON.stringify(technicianNames),
      productIds: JSON.stringify(data.productIds),
      productNames: JSON.stringify(productNames),
      address: data.address, notes: data.notes,
    });
  }, [uM]);

  const completeAppointment = useCallback(async (id: string, completionNotes: string, completedBy: string) => {
    await completeM.mutateAsync({
      id: parseInt(id),
      completionNotes,
      completedBy,
    });
  }, [completeM]);

  const deleteRecurrenceGroup = useCallback(async (recurrenceGroupId: string, fromDate?: string) => {
    await deleteGroupM.mutateAsync({ recurrenceGroupId, fromDate });
  }, [deleteGroupM]);

  const deleteAppointment = useCallback(async (id: string) => { await dM.mutateAsync({ id: parseInt(id) }); }, [dM]);
  const getAppointmentById = useCallback((id: string) => appointments.find(a => a.id === id), [appointments]);
  const getAppointmentsByDate = useCallback((date: string) => appointments.filter(a => a.date === date), [appointments]);
  const getAppointmentsByMonth = useCallback((year: number, month: number) =>
    appointments.filter(a => { const d = new Date(a.date); return d.getFullYear() === year && d.getMonth() === month; }),
    [appointments]);

  const getStats = useCallback(() => {
    const total = appointments.length;
    const pending = appointments.filter(a => a.status === 'pending').length;
    const confirmed = appointments.filter(a => a.status === 'confirmed').length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const cancelled = appointments.filter(a => a.status === 'cancelled').length;
    const _n = new Date();
    const today = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
    const todayAppointments = appointments.filter(a => a.date === today).length;
    return { total, pending, confirmed, completed, cancelled, todayAppointments };
  }, [appointments]);

  return {
    appointments, addAppointment, updateAppointment, deleteAppointment,
    completeAppointment, deleteRecurrenceGroup,
    getAppointmentById, getAppointmentsByDate, getAppointmentsByMonth, getStats,
  };
}

function _toLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tryParse(val: any, fallback: any) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
  return fallback;
}
