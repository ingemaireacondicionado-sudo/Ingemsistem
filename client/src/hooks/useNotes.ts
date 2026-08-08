import { useCallback, useMemo } from 'react';
import type { Note, NoteFormData } from '@/types/note';
import { trpc } from '@/lib/trpc';

export function useNotes() {
  const q = trpc.notes.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.notes.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.notes.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.notes.delete.useMutation({ onSuccess: () => q.refetch() });

  const notes: Note[] = useMemo(() =>
    (q.data ?? []).map((n: any) => ({
      id: String(n.id), title: n.title ?? '', content: n.content ?? '',
      assignedTo: n.assignedTo || 'unassigned',
      assignedToName: n.assignedTo === 'maxi' ? 'Maxi' : n.assignedTo === 'ludmila' ? 'Ludmila' : n.assignedTo === 'both' ? 'Ambos' : 'Sin asignar',
      priority: n.priority ?? 'medium', status: n.status === 'in-progress' ? 'in_progress' : (n.status ?? 'pending'),
      category: n.category ?? 'general', dueDate: n.dueDate || undefined,
      createdBy: n.createdBy ?? '', createdByName: n.createdBy ?? '',
      createdAt: n.createdAt ? _toLocal(new Date(n.createdAt)) : '',
      updatedAt: n.updatedAt ? _toLocal(new Date(n.updatedAt)) : '',
      completedAt: n.status === 'completed' ? (n.updatedAt ? _toLocal(new Date(n.updatedAt)) : '') : undefined,
      customerId: n.customerId ?? null,
      customerName: n.customerName ?? '',
      documentType: n.documentType ?? 'none',
      documentNumber: n.documentNumber ?? '',
    })), [q.data]);

  const addNote = useCallback(async (data: NoteFormData, createdBy: string, createdByName: string): Promise<string> => {
    const result = await cM.mutateAsync({
      title: data.title, content: data.content, priority: data.priority,
      status: data.status === 'in_progress' ? 'in-progress' : data.status as any,
      category: data.category, dueDate: data.dueDate ?? '',
      assignedTo: data.assignedTo, createdBy: createdByName,
      customerId: data.customerId ?? null,
      customerName: data.customerName ?? '',
      documentType: data.documentType ?? 'none',
      documentNumber: data.documentNumber ?? '',
    });
    return String(result.id);
  }, [cM]);

  const updateNote = useCallback(async (id: string, data: NoteFormData) => {
    await uM.mutateAsync({
      id: parseInt(id), title: data.title, content: data.content,
      priority: data.priority,
      status: data.status === 'in_progress' ? 'in-progress' : data.status as any,
      category: data.category, dueDate: data.dueDate,
      assignedTo: data.assignedTo,
      customerId: data.customerId ?? null,
      customerName: data.customerName ?? '',
      documentType: data.documentType ?? 'none',
      documentNumber: data.documentNumber ?? '',
    });
  }, [uM]);

  const deleteNote = useCallback(async (id: string) => { await dM.mutateAsync({ id: parseInt(id) }); }, [dM]);
  const getNoteById = useCallback((id: string) => notes.find(n => n.id === id), [notes]);
  const getNotesByUser = useCallback((userName: string) => notes.filter(n => n.assignedTo === userName), [notes]);
  const getNotesByStatus = useCallback((status: string) => notes.filter(n => n.status === status), [notes]);
  const getNotesByPriority = useCallback((priority: string) => notes.filter(n => n.priority === priority), [notes]);
  const getPendingNotes = useCallback(() => notes.filter(n => n.status === 'pending' || n.status === 'in_progress'), [notes]);
  const getUrgentNotes = useCallback(() => notes.filter(n => (n.priority === 'urgent' || n.priority === 'high') && n.status !== 'completed'), [notes]);
  const getOverdueNotes = useCallback(() => {
    const _n = new Date();
    const today = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
    return notes.filter(n => n.dueDate && n.dueDate < today && n.status !== 'completed');
  }, [notes]);

  const getStats = useCallback(() => {
    const total = notes.length;
    const pending = notes.filter(n => n.status === 'pending').length;
    const inProgress = notes.filter(n => n.status === 'in_progress' || n.status === ('in-progress' as any)).length;
    const completed = notes.filter(n => n.status === 'completed').length;
    const cancelled = notes.filter(n => n.status === 'cancelled').length;
    const urgent = notes.filter(n => n.priority === 'urgent').length;
    const high = notes.filter(n => n.priority === 'high').length;
    const _t = new Date();
    const today = `${_t.getFullYear()}-${String(_t.getMonth()+1).padStart(2,'0')}-${String(_t.getDate()).padStart(2,'0')}`;
    const overdue = notes.filter(n => n.dueDate && n.dueDate < today && n.status !== 'completed').length;
    const assignedToMaxi = notes.filter(n => n.assignedTo === 'maxi').length;
    const assignedToLudmila = notes.filter(n => n.assignedTo === 'ludmila').length;
    return { total, pending, inProgress, completed, cancelled, urgent, high, overdue, assignedToMaxi, assignedToLudmila };
  }, [notes]);

  return { notes, addNote, updateNote, deleteNote, getNoteById, getNotesByUser, getNotesByStatus, getNotesByPriority, getPendingNotes, getUrgentNotes, getOverdueNotes, getStats };
}

function _toLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
