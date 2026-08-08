import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  Check,
  Calendar,
  User,
  MoreVertical,
  Flag,
  RotateCcw,
  Building2,
  Receipt,
  X,
  MessageCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Note } from '@/types/note';
import {
  PRIORITY_OPTIONS,
  NOTE_STATUS,
  NOTE_CATEGORIES,
  ASSIGNED_TO_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  sortNotes,
} from '@/types/note';
import { parseLocalDate } from '@/lib/dateUtils';
import { normalize } from '@/lib/textUtils';

interface NotesListProps {
  notes: Note[];
  currentUser: { id: string; name: string };
  onDelete: (id: string) => void | Promise<void>;
  onStatusChange: (id: string, status: Note['status']) => void | Promise<void>;
}

// Fallbacks defensivos para datos viejos con categorías/prioridades desconocidas
function getCategory(key: string) {
  return NOTE_CATEGORIES[key as keyof typeof NOTE_CATEGORIES] ?? { icon: '📝', label: key || 'General' };
}
function getPriority(key: string) {
  return PRIORITY_OPTIONS[key as keyof typeof PRIORITY_OPTIONS] ?? PRIORITY_OPTIONS.medium;
}

interface DisplayChecklistItem {
  text: string;
  completed: boolean;
}

function parseNoteContentForDisplay(value: string): { annotation: string; items: DisplayChecklistItem[] } {
  const annotationLines: string[] = [];
  const items: DisplayChecklistItem[] = [];

  (value || '').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*(?:[-*]\s*)?\[([ xX])\]\s+(.+?)\s*$/);
    if (match) {
      items.push({ text: match[2], completed: match[1].toLowerCase() === 'x' });
    } else {
      annotationLines.push(line);
    }
  });

  return {
    annotation: annotationLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    items,
  };
}

function openWhatsAppShare(message: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
}

function buildNoteWhatsAppMessage(note: Note): string {
  const parsedContent = parseNoteContentForDisplay(note.content);
  const status = NOTE_STATUS[note.status as keyof typeof NOTE_STATUS] ?? NOTE_STATUS.pending;
  const priority = getPriority(note.priority);
  const lines = [
    `*${note.title}*`,
    `${priority.icon} Prioridad: ${priority.label}`,
    `Estado: ${status.label}`,
  ];

  if (note.assignedToName) lines.push(`Responsable: ${note.assignedToName}`);
  if (note.dueDate) lines.push(`Fecha: ${parseLocalDate(note.dueDate).toLocaleDateString('es-AR')}`);
  if (note.customerName) lines.push(`Cliente: ${note.customerName}`);
  if (note.documentType && note.documentType !== 'none') {
    const documentLabel = DOCUMENT_TYPE_OPTIONS[note.documentType]?.label ?? 'Documento';
    lines.push(`${documentLabel}: ${note.documentNumber || 'Sin número'}`);
  }
  if (parsedContent.annotation) lines.push('', '*Anotaciones*', parsedContent.annotation);
  if (parsedContent.items.length > 0) {
    lines.push('', '*Lista de pendientes*');
    parsedContent.items.forEach(item => lines.push(`${item.completed ? '✅' : '⬜'} ${item.text}`));
  }

  return lines.join('\n');
}

function buildNotesListWhatsAppMessage(notes: Note[], listLabel: string): string {
  const maximumNotes = 30;
  const notesToShare = notes.slice(0, maximumNotes);
  const todayLabel = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [`*INGEM | ${listLabel.toUpperCase()}*`, todayLabel, ''];

  notesToShare.forEach((note, index) => {
    const parsedContent = parseNoteContentForDisplay(note.content);
    const pendingItems = parsedContent.items.filter(item => !item.completed);
    const noteIcon = note.status === 'completed' ? '✅' : isNoteOverdue(note) ? '🔴' : '⬜';
    lines.push(`${index + 1}. ${noteIcon} *${note.title}*`);
    if (note.customerName) lines.push(`   Cliente: ${note.customerName}`);
    if (note.dueDate) lines.push(`   Fecha: ${parseLocalDate(note.dueDate).toLocaleDateString('es-AR')}`);
    if (note.assignedToName) lines.push(`   Responsable: ${note.assignedToName}`);
    pendingItems.slice(0, 5).forEach(item => lines.push(`   ▫️ ${item.text}`));
    if (pendingItems.length > 5) lines.push(`   +${pendingItems.length - 5} pasos más`);
    lines.push('');
  });

  if (notes.length > maximumNotes) {
    lines.push(`Hay ${notes.length - maximumNotes} notas más. Aplicá un filtro más específico para compartirlas.`);
  }

  return lines.join('\n').trim();
}

function isNoteOverdue(note: Note): boolean {
  if (!note.dueDate || note.status === 'completed' || note.status === 'cancelled') return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return note.dueDate < today;
}

export function NotesList({ notes, currentUser, onDelete, onStatusChange }: NotesListProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canCreateEntity, canEditEntity, canDeleteEntity } = useAuth();
  const canCreateNotes = canCreateEntity('notes');
  const canEditNotes = canEditEntity('notes');
  const canDeleteNotes = canDeleteEntity('notes');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssigned, setFilterAssigned] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  // Arranca en Pendientes: lo completado no molesta hasta que lo busques
  const [activeTab, setActiveTab] = useState(searchParams.get('view') === 'overdue' ? 'overdue' : 'pending');

  const isOverdue = (note: Note) => isNoteOverdue(note);

  // Personas asignables derivadas de las notas reales (sin nombres hardcodeados)
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    notes.forEach(n => {
      if (n.assignedTo && n.assignedTo !== 'both' && n.assignedTo !== 'unassigned' && n.assignedToName) {
        map.set(n.assignedTo, n.assignedToName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [notes]);

  // Filtrar notas
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      searchTerm === '' ||
      normalize(note.title).includes(normalize(searchTerm)) ||
      normalize(note.content).includes(normalize(searchTerm)) ||
      (note.customerName && normalize(note.customerName).includes(normalize(searchTerm))) ||
      (note.documentNumber && normalize(note.documentNumber).includes(normalize(searchTerm)));

    const matchesPriority = filterPriority === 'all' || note.priority === filterPriority;

    const matchesAssigned = filterAssigned === 'all' ||
      (filterAssigned === 'me' && (note.assignedTo === currentUser.id || note.assignedTo === 'both')) ||
      note.assignedTo === filterAssigned;

    const matchesCategory = filterCategory === 'all' || note.category === filterCategory;

    // Filtro por tab (incluye 'overdue' desde la tarjeta Vencidas)
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'pending' && (note.status === 'pending' || note.status === 'in_progress')) ||
      (activeTab === 'completed' && note.status === 'completed') ||
      (activeTab === 'urgent' && (note.priority === 'high' || note.priority === 'urgent') && note.status !== 'completed') ||
      (activeTab === 'overdue' && isOverdue(note)) ||
      (activeTab === 'mine' && (note.assignedTo === currentUser.id || note.assignedTo === 'both') && note.status !== 'completed');

    return matchesSearch && matchesPriority && matchesAssigned && matchesCategory && matchesTab;
  });

  // Orden: vencidas primero, después el orden normal
  const sortedNotes = useMemo(() => {
    const base = sortNotes(filteredNotes);
    return [...base.filter(n => isOverdue(n)), ...base.filter(n => !isOverdue(n))];
  }, [filteredNotes]);

  const selectedNoteContent = selectedNote ? parseNoteContentForDisplay(selectedNote.content) : null;
  const listLabels: Record<string, string> = {
    all: 'Todas las notas',
    pending: 'Lista de pendientes',
    urgent: 'Pendientes urgentes',
    mine: 'Mis pendientes',
    completed: 'Tareas completadas',
    overdue: 'Pendientes vencidos',
  };
  const currentListLabel = listLabels[activeTab] ?? 'Lista de tareas';

  const shareCurrentList = () => {
    if (sortedNotes.length === 0) return;
    openWhatsAppShare(buildNotesListWhatsAppMessage(sortedNotes, currentListLabel));
  };

  // Stats
  const pendingCount = notes.filter(n => n.status === 'pending' || n.status === 'in_progress').length;
  const overdueCount = notes.filter(n => isOverdue(n)).length;
  const urgentCount = notes.filter(n =>
    (n.priority === 'high' || n.priority === 'urgent') &&
    n.status !== 'completed'
  ).length;
  const myCount = notes.filter(n =>
    (n.assignedTo === currentUser.id || n.assignedTo === 'both') &&
    n.status !== 'completed'
  ).length;

  const handleDelete = async () => {
    if (!selectedNote || isDeleting) return;
    if (!canDeleteNotes) {
      setDeleteError('No tenés permiso para eliminar notas.');
      return;
    }

    setDeleteError('');
    setIsDeleting(true);
    try {
      await onDelete(selectedNote.id);
      setDeleteDialogOpen(false);
      setSelectedNote(null);
    } catch {
      setDeleteError('No se pudo eliminar la nota. Probá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const changeStatus = async (note: Note, nextStatus: Note['status']) => {
    if (!canEditNotes) {
      setStatusError('No tenés permiso para modificar notas.');
      return false;
    }
    if (statusChangingId) return false;
    if (nextStatus === 'completed') {
      const checklist = parseNoteContentForDisplay(note.content).items;
      if (checklist.some(item => !item.completed)) {
        setSelectedNote(note);
        setDetailDialogOpen(true);
        setStatusError('Todavía hay pasos pendientes. Marcálos desde Editar antes de completar la nota.');
        return false;
      }
    }
    setStatusError('');
    setStatusChangingId(note.id);
    try {
      await onStatusChange(note.id, nextStatus);
      return true;
    } catch (err) {
      console.error('Error updating note status:', err);
      setStatusError('No se pudo actualizar la nota. Probá de nuevo.');
      return false;
    } finally {
      setStatusChangingId(null);
    }
  };

  const toggleComplete = async (note: Note) => {
    await changeStatus(note, note.status === 'completed' ? 'pending' : 'completed');
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-5 lg:pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Pendientes / Notas</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {pendingCount} pendientes{overdueCount > 0 ? ` · ${overdueCount} vencidas` : ''}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            aria-label="Compartir la lista visible por WhatsApp"
            className="min-h-11 min-w-11 touch-manipulation border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
            onClick={shareCurrentList}
            disabled={sortedNotes.length === 0}
          >
            <MessageCircle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Compartir lista</span>
          </Button>
          {canCreateNotes && (
            <Button
              type="button"
              aria-label="Crear una nueva nota"
              className="min-h-11 min-w-11 flex-shrink-0 touch-manipulation bg-sky-600 hover:bg-sky-700"
              onClick={() => navigate('/notes/new')}
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Nueva Nota</span>
            </Button>
          )}
        </div>
      </div>

      {statusError && (
        <div role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-700">
          {statusError}
        </div>
      )}

      {/* Stats Cards - tocables para filtrar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Card
          className={`min-h-0 py-0 gap-0 min-w-0 cursor-pointer hover:shadow-md transition-all ${activeTab === 'pending' ? 'ring-2 ring-amber-400' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <CardContent className="p-3 text-center sm:p-4 sm:text-left">
            <p className="text-xs sm:text-sm text-slate-500">Pendientes</p>
            <p className="text-lg sm:text-2xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card
          className={`min-h-0 py-0 gap-0 min-w-0 cursor-pointer hover:shadow-md transition-all ${activeTab === 'overdue' ? 'ring-2 ring-red-400' : ''}`}
          onClick={() => setActiveTab(activeTab === 'overdue' ? 'pending' : 'overdue')}
        >
          <CardContent className="p-3 text-center sm:p-4 sm:text-left">
            <p className="text-xs sm:text-sm text-red-600">Vencidas</p>
            <p className="text-lg sm:text-2xl font-bold text-red-600">{overdueCount}</p>
          </CardContent>
        </Card>
        <Card
          className={`min-h-0 py-0 gap-0 min-w-0 cursor-pointer hover:shadow-md transition-all ${activeTab === 'urgent' ? 'ring-2 ring-orange-400' : ''}`}
          onClick={() => setActiveTab('urgent')}
        >
          <CardContent className="p-3 text-center sm:p-4 sm:text-left">
            <p className="text-xs sm:text-sm text-slate-500">Urgentes</p>
            <p className="text-lg sm:text-2xl font-bold text-orange-600">{urgentCount}</p>
          </CardContent>
        </Card>
        <Card
          className={`min-h-0 py-0 gap-0 min-w-0 cursor-pointer hover:shadow-md transition-all ${activeTab === 'mine' ? 'ring-2 ring-sky-400' : ''}`}
          onClick={() => setActiveTab('mine')}
        >
          <CardContent className="p-3 text-center sm:p-4 sm:text-left">
            <p className="text-xs sm:text-sm text-slate-500">Mías</p>
            <p className="text-lg sm:text-2xl font-bold text-sky-600">{myCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-11 w-full max-w-2xl justify-start gap-1 overflow-x-auto p-1 sm:h-10">
          <TabsTrigger value="all" className="min-w-[76px] flex-shrink-0">Todas</TabsTrigger>
          <TabsTrigger value="pending" className="min-w-[104px] flex-shrink-0">Pendientes</TabsTrigger>
          <TabsTrigger value="urgent" className="min-w-[96px] flex-shrink-0">Urgentes</TabsTrigger>
          <TabsTrigger value="mine" className="min-w-[72px] flex-shrink-0">Mías</TabsTrigger>
          <TabsTrigger value="completed" className="min-w-[112px] flex-shrink-0">Completadas</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Indicador del filtro Vencidas (no tiene tab propio) */}
      {activeTab === 'overdue' && (
        <Badge
          className="cursor-pointer bg-red-100 text-red-700 hover:bg-red-200"
          onClick={() => setActiveTab('pending')}
        >
          Mostrando: Vencidas <X className="w-3 h-3 ml-1 inline" />
        </Badge>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar nota..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 pl-10 text-base sm:h-9 sm:text-sm"
          />
        </div>
        <div className="w-full max-w-full min-w-0 sm:w-auto flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="min-h-11 px-3 py-2 border rounded-lg text-base sm:text-sm flex-shrink-0"
          >
            <option value="all">Prioridad: todas</option>
            {Object.entries(PRIORITY_OPTIONS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filterAssigned}
            onChange={(e) => setFilterAssigned(e.target.value)}
            className="min-h-11 px-3 py-2 border rounded-lg text-base sm:text-sm flex-shrink-0"
          >
            <option value="all">Asignado: todos</option>
            <option value="me">Asignadas a mí</option>
            {assigneeOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
            <option value="both">Ambos</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="min-h-11 px-3 py-2 border rounded-lg text-base sm:text-sm flex-shrink-0"
          >
            <option value="all">Categoría: todas</option>
            {Object.entries(NOTE_CATEGORIES).map(([key, { label, icon }]) => (
              <option key={key} value={key}>{icon} {label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes List */}
      <div className="space-y-2 sm:space-y-3">
        {sortedNotes.map((note) => {
          const overdue = isOverdue(note);
          const completed = note.status === 'completed';
          const parsedContent = parseNoteContentForDisplay(note.content);
          const completedChecklistItems = parsedContent.items.filter(item => item.completed).length;
          return (
            <Card
              key={note.id}
              className={`
                min-h-0 py-0 gap-0 w-full min-w-0 overflow-hidden
                hover:shadow-md transition-all cursor-pointer border-l-4
                ${completed ? 'opacity-60' : ''}
                ${overdue ? 'border-l-red-500 bg-red-50/40' : getPriorityBorderColor(note.priority)}
              `}
              onClick={() => { setStatusError(''); setSelectedNote(note); setDetailDialogOpen(true); }}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  {/* Check de completar con un toque */}
                  {canEditNotes ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleComplete(note); }}
                      disabled={statusChangingId === note.id}
                      aria-label={completed ? 'Reabrir nota' : 'Marcar nota como completada'}
                      className={`
                        mt-0.5 w-11 h-11 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 touch-manipulation
                        border-2 transition-all
                        ${statusChangingId === note.id ? 'opacity-50 cursor-wait' : ''}
                        ${completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : `bg-white ${getPriorityRingColor(note.priority)} text-transparent hover:text-slate-300`}
                      `}
                      title={completed ? 'Reabrir' : 'Marcar completada'}
                    >
                      <Check className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                    </button>
                  ) : (
                    <span
                      role="img"
                      aria-label={completed ? 'Nota completada' : 'Nota pendiente'}
                      className={`mt-0.5 w-11 h-11 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                        completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : `bg-white ${getPriorityRingColor(note.priority)} text-transparent`
                      }`}
                    >
                      <Check className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                    </span>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <h3 className={`font-semibold text-sm sm:text-base text-slate-800 ${completed ? 'line-through text-slate-500' : ''}`}>
                          {note.title}
                        </h3>
                        {parsedContent.annotation && (
                          <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-slate-500 sm:text-sm">{parsedContent.annotation}</p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="-mr-1 h-11 w-11 flex-shrink-0 touch-manipulation sm:h-8 sm:w-8" aria-label={`Acciones de ${note.title}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openWhatsAppShare(buildNoteWhatsAppMessage(note)); }}>
                            <MessageCircle className="mr-2 h-4 w-4 text-green-600" />
                            Compartir por WhatsApp
                          </DropdownMenuItem>
                          {canEditNotes && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/notes/${note.id}/edit`); }}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {canDeleteNotes && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteError('');
                                setSelectedNote(note);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {parsedContent.items.length > 0 && (
                      <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-slate-600">Lista de pendientes</p>
                          <span className={`text-xs font-semibold ${completedChecklistItems === parsedContent.items.length ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {completedChecklistItems}/{parsedContent.items.length}
                          </span>
                        </div>
                        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.round((completedChecklistItems / parsedContent.items.length) * 100)}%` }}
                          />
                        </div>
                        <div className="space-y-1">
                          {parsedContent.items.slice(0, 3).map((item, itemIndex) => (
                            <div key={`${note.id}-item-${itemIndex}`} className="flex min-w-0 items-start gap-2 text-xs">
                              <span className={`mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${item.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                                {item.completed && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                              </span>
                              <span className={`min-w-0 break-words ${item.completed ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{item.text}</span>
                            </div>
                          ))}
                          {parsedContent.items.length > 3 && (
                            <p className="pl-5 text-xs text-slate-400">+{parsedContent.items.length - 3} pasos más</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Meta info */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                      {overdue && note.dueDate && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          <Calendar className="w-3 h-3 mr-1" />
                          Vencida: {parseLocalDate(note.dueDate).toLocaleDateString('es-AR')}
                        </Badge>
                      )}
                      {!overdue && note.dueDate && (
                        <Badge variant="outline" className="text-xs">
                          <Calendar className="w-3 h-3 mr-1" />
                          {parseLocalDate(note.dueDate).toLocaleDateString('es-AR')}
                        </Badge>
                      )}
                      <Badge className={`text-xs ${(ASSIGNED_TO_OPTIONS[note.assignedTo as keyof typeof ASSIGNED_TO_OPTIONS] ?? ASSIGNED_TO_OPTIONS.unassigned).color}`}>
                        <User className="w-3 h-3 mr-1" />
                        {note.assignedToName}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {getCategory(note.category).icon} {getCategory(note.category).label}
                      </Badge>
                      {note.customerName && (
                        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-xs">
                          <Building2 className="w-3 h-3 mr-1" />
                          {note.customerName}
                        </Badge>
                      )}
                      {note.documentType && note.documentType !== 'none' && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                          <Receipt className="w-3 h-3 mr-1" />
                          {DOCUMENT_TYPE_OPTIONS[note.documentType]?.label}{note.documentNumber ? `: ${note.documentNumber}` : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sortedNotes.length === 0 && (
        <div className="text-center py-8 sm:py-12">
          <CheckCircle className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">
            {activeTab === 'pending' ? 'Sin pendientes 🎉' : 'No hay notas'}
          </h3>
          <p className="text-slate-500 mb-4">
            {activeTab === 'pending' ? 'Todo al día. Creá una nota nueva cuando necesites.' : 'Crea una nueva nota para comenzar'}
          </p>
          {canCreateNotes && (
          <Button type="button" className="min-h-11 touch-manipulation" onClick={() => navigate('/notes/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Nota
          </Button>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => {
        setDetailDialogOpen(open);
        if (!open) setStatusError('');
      }}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedNote && getPriority(selectedNote.priority).icon}</span>
              {selectedNote?.title}
            </DialogTitle>
            <DialogDescription>
              Creada por {selectedNote?.createdByName} el {selectedNote && parseLocalDate(selectedNote.createdAt).toLocaleDateString('es-AR')}
            </DialogDescription>
          </DialogHeader>

          {selectedNote && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={(NOTE_STATUS[selectedNote.status as keyof typeof NOTE_STATUS] ?? NOTE_STATUS.pending).color}>
                  {(NOTE_STATUS[selectedNote.status as keyof typeof NOTE_STATUS] ?? NOTE_STATUS.pending).label}
                </Badge>
                <Badge className={getPriority(selectedNote.priority).color}>
                  <Flag className="w-3 h-3 mr-1" />
                  Prioridad: {getPriority(selectedNote.priority).label}
                </Badge>
                <Badge className={(ASSIGNED_TO_OPTIONS[selectedNote.assignedTo as keyof typeof ASSIGNED_TO_OPTIONS] ?? ASSIGNED_TO_OPTIONS.unassigned).color}>
                  <User className="w-3 h-3 mr-1" />
                  Asignado a: {selectedNote.assignedToName}
                </Badge>
              </div>

              {selectedNoteContent?.annotation ? (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Anotaciones</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{selectedNoteContent.annotation}</p>
                </div>
              ) : selectedNoteContent?.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Esta nota todavía no tiene anotaciones ni pasos cargados.
                </div>
              ) : null}

              {selectedNoteContent && selectedNoteContent.items.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Lista de pendientes</p>
                      <p className="text-xs text-slate-500">Avance de la tarea</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {selectedNoteContent.items.filter(item => item.completed).length}/{selectedNoteContent.items.length}
                    </Badge>
                  </div>
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.round((selectedNoteContent.items.filter(item => item.completed).length / selectedNoteContent.items.length) * 100)}%` }}
                    />
                  </div>
                  <div className="space-y-2">
                    {selectedNoteContent.items.map((item, itemIndex) => (
                      <div key={`${selectedNote.id}-detail-item-${itemIndex}`} className={`flex items-start gap-2 rounded-lg p-2 text-sm ${item.completed ? 'bg-emerald-50/60 text-slate-400' : 'bg-slate-50 text-slate-700'}`}>
                        <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${item.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                          {item.completed && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className={`min-w-0 break-words ${item.completed ? 'line-through' : ''}`}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                  {canEditNotes && (
                    <p className="mt-3 text-xs text-slate-500">Usá Editar para marcar o modificar pasos individuales.</p>
                  )}
                </div>
              )}

              {/* Customer & Document info */}
              {(selectedNote.customerName || (selectedNote.documentType && selectedNote.documentType !== 'none')) && (
                <div className="p-3 bg-sky-50 rounded-lg space-y-2">
                  {selectedNote.customerName && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-sky-600" />
                      <span className="text-slate-600">Cliente:</span>
                      <span className="font-medium text-slate-800">{selectedNote.customerName}</span>
                    </div>
                  )}
                  {selectedNote.documentType && selectedNote.documentType !== 'none' && (
                    <div className="flex items-center gap-2 text-sm">
                      <Receipt className="w-4 h-4 text-amber-600" />
                      <span className="text-slate-600">{DOCUMENT_TYPE_OPTIONS[selectedNote.documentType]?.label}:</span>
                      <span className="font-medium text-slate-800">{selectedNote.documentNumber || 'Sin número'}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {getCategory(selectedNote.category).icon} {getCategory(selectedNote.category).label}
                </Badge>
                {selectedNote.dueDate && (
                  <Badge
                    variant="outline"
                    className={isOverdue(selectedNote) ? 'text-red-600 border-red-300 bg-red-50' : ''}
                  >
                    <Calendar className="w-3 h-3 mr-1" />
                    Vence: {parseLocalDate(selectedNote.dueDate).toLocaleDateString('es-AR')}
                  </Badge>
                )}
              </div>

              {statusError && (
                <div role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-700">
                  {statusError}
                </div>
              )}

              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-col gap-2 border-t border-slate-200/80 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:-mx-6 sm:-mb-6 sm:flex-row sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1 touch-manipulation border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                  onClick={() => openWhatsAppShare(buildNoteWhatsAppMessage(selectedNote))}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  WhatsApp
                </Button>
                {canEditNotes && (selectedNote.status !== 'completed' ? (
                  <Button
                    type="button"
                    className="flex-1 min-h-11 bg-emerald-600 hover:bg-emerald-700 touch-manipulation"
                    disabled={statusChangingId === selectedNote.id}
                    onClick={async () => {
                      const changed = await changeStatus(selectedNote, 'completed');
                      if (changed) setDetailDialogOpen(false);
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {statusChangingId === selectedNote.id ? 'Confirmando...' : 'Marcar como Completada'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 min-h-11 touch-manipulation"
                    disabled={statusChangingId === selectedNote.id}
                    onClick={async () => {
                      const changed = await changeStatus(selectedNote, 'pending');
                      if (changed) setDetailDialogOpen(false);
                    }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {statusChangingId === selectedNote.id ? 'Reabriendo...' : 'Reabrir Nota'}
                  </Button>
                ))}
                {canEditNotes && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Editar nota"
                    className="min-h-11 min-w-11 touch-manipulation"
                    onClick={() => navigate(`/notes/${selectedNote.id}/edit`)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
                {canDeleteNotes && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Eliminar nota"
                    className="min-h-11 min-w-11 touch-manipulation text-red-500"
                    onClick={() => {
                      setDeleteError('');
                      setDetailDialogOpen(false);
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

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eliminar Nota</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar la nota <strong>{selectedNote?.title}</strong>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting || !canDeleteNotes}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getPriorityBorderColor(priority: Note['priority']): string {
  const colors = {
    low: 'border-l-slate-400',
    medium: 'border-l-blue-400',
    high: 'border-l-orange-400',
    urgent: 'border-l-red-500',
  };
  return colors[priority] ?? 'border-l-blue-400';
}

function getPriorityRingColor(priority: Note['priority']): string {
  const colors = {
    low: 'border-slate-300',
    medium: 'border-blue-400',
    high: 'border-orange-400',
    urgent: 'border-red-500',
  };
  return colors[priority] ?? 'border-blue-400';
}
