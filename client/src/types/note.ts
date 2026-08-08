export interface Note {
  id: string;
  title: string;
  content: string;
  assignedTo: 'maxi' | 'ludmila' | 'both' | 'unassigned';
  assignedToName: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  category: 'general' | 'client' | 'supplier' | 'technical' | 'administrative' | 'urgent';
  dueDate?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  customerId?: number | null;
  customerName?: string;
  documentType: 'none' | 'budget' | 'invoice';
  documentNumber?: string;
}

export interface NoteFormData {
  title: string;
  content: string;
  assignedTo: 'maxi' | 'ludmila' | 'both' | 'unassigned';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  category: 'general' | 'client' | 'supplier' | 'technical' | 'administrative' | 'urgent';
  dueDate?: string;
  customerId?: number | null;
  customerName?: string;
  documentType: 'none' | 'budget' | 'invoice';
  documentNumber?: string;
}

export const DOCUMENT_TYPE_OPTIONS = {
  none: { label: 'Ninguno', icon: '—' },
  budget: { label: 'Presupuesto', icon: '📋' },
  invoice: { label: 'Factura', icon: '🧾' },
};

export const PRIORITY_OPTIONS = {
  low: { label: 'Baja', color: 'bg-slate-100 text-slate-700', borderColor: 'border-slate-300', icon: '🔵' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-700', borderColor: 'border-blue-300', icon: '🟡' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700', borderColor: 'border-orange-300', icon: '🟠' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700', borderColor: 'border-red-300', icon: '🔴' },
};

export const NOTE_STATUS = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'En Progreso', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', color: 'bg-slate-100 text-slate-500' },
};

export const NOTE_CATEGORIES = {
  general: { label: 'General', icon: '📋' },
  client: { label: 'Cliente', icon: '👤' },
  supplier: { label: 'Proveedor', icon: '🚚' },
  technical: { label: 'Técnico', icon: '🔧' },
  administrative: { label: 'Administrativo', icon: '📁' },
  urgent: { label: 'Urgente', icon: '⚠️' },
};

export const ASSIGNED_TO_OPTIONS = {
  maxi: { label: 'Maxi', color: 'bg-sky-100 text-sky-700' },
  ludmila: { label: 'Ludmila', color: 'bg-pink-100 text-pink-700' },
  both: { label: 'Ambos', color: 'bg-purple-100 text-purple-700' },
  unassigned: { label: 'Sin asignar', color: 'bg-slate-100 text-slate-500' },
};

// Función para obtener el color de prioridad
export function getPriorityColor(priority: Note['priority']) {
  return PRIORITY_OPTIONS[priority].color;
}

export function getPriorityLabel(priority: Note['priority']) {
  return PRIORITY_OPTIONS[priority].label;
}

export function getPriorityBorderColor(priority: Note['priority']) {
  return PRIORITY_OPTIONS[priority].borderColor;
}

// Función para ordenar notas por prioridad y fecha
export function sortNotes(notes: Note[]): Note[] {
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const statusOrder = { pending: 0, in_progress: 1, completed: 2, cancelled: 3 };
  
  return [...notes].sort((a, b) => {
    // Primero por estado (pendientes primero)
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    // Luego por prioridad
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    // Finalmente por fecha de vencimiento (las más próximas primero)
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

// Función para filtrar notas por usuario
export function filterNotesByUser(notes: Note[], userId: string): Note[] {
  return notes.filter(note => 
    note.assignedTo === userId || 
    note.assignedTo === 'both' ||
    note.createdBy === userId
  );
}

// Función para obtener notas pendientes urgentes
export function getUrgentPendingNotes(notes: Note[]): Note[] {
  return notes.filter(note => 
    (note.status === 'pending' || note.status === 'in_progress') &&
    (note.priority === 'high' || note.priority === 'urgent')
  );
}
