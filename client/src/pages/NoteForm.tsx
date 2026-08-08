import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  FileText,
  User,
  Flag,
  Calendar,
  Tag,
  Building2,
  Receipt,
  Search,
  X,
  Plus,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { Note, NoteFormData } from '@/types/note';
import { PRIORITY_OPTIONS, NOTE_STATUS, NOTE_CATEGORIES, ASSIGNED_TO_OPTIONS, DOCUMENT_TYPE_OPTIONS } from '@/types/note';
import type { Customer } from '@/types/customer';
import { parseLocalDate } from '@/lib/dateUtils';
import { normalize } from '@/lib/textUtils';
import { useAuth } from '@/contexts/AuthContext';

interface NoteFormProps {
  notes: Note[];
  customers: Customer[];
  currentUser: { id: string; name: string };
  onSave: (data: NoteFormData, createdBy: string, createdByName: string) => string | Promise<string>;
  onUpdate: (id: string, data: NoteFormData) => void | Promise<void>;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

const CHECKLIST_TEMPLATES = [
  {
    id: 'service',
    icon: '🔧',
    label: 'Visita técnica',
    defaultTitle: 'Preparar visita técnica',
    priority: 'high' as const,
    items: [
      'Confirmar día, horario y contacto',
      'Revisar antecedentes del cliente',
      'Preparar herramientas y repuestos',
      'Realizar el trabajo y tomar registro',
      'Enviar informe y dejar próximos pasos',
    ],
  },
  {
    id: 'purchase',
    icon: '📦',
    label: 'Compra / repuesto',
    defaultTitle: 'Gestionar compra de repuesto',
    priority: 'medium' as const,
    items: [
      'Confirmar modelo, código y cantidad',
      'Pedir precio y disponibilidad',
      'Comparar proveedor y plazo de entrega',
      'Autorizar la compra',
      'Registrar retiro o recepción',
    ],
  },
  {
    id: 'collection',
    icon: '💳',
    label: 'Cobranza',
    defaultTitle: 'Seguimiento de cobranza',
    priority: 'high' as const,
    items: [
      'Verificar presupuesto u orden de compra',
      'Confirmar factura enviada',
      'Consultar fecha de pago',
      'Registrar respuesta del cliente',
      'Confirmar acreditación',
    ],
  },
];

function createChecklistItem(text: string, completed = false): ChecklistItem {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    completed,
  };
}

function parseNoteContent(value: string): { annotation: string; items: ChecklistItem[] } {
  const annotationLines: string[] = [];
  const items: ChecklistItem[] = [];

  value.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*(?:[-*]\s*)?\[([ xX])\]\s+(.+?)\s*$/);
    if (match) {
      items.push(createChecklistItem(match[2], match[1].toLowerCase() === 'x'));
    } else {
      annotationLines.push(line);
    }
  });

  return {
    annotation: annotationLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    items,
  };
}

function serializeNoteContent(annotation: string, items: ChecklistItem[]): string {
  const sections: string[] = [];
  const validItems = items.filter(item => item.text.trim());
  if (annotation.trim()) sections.push(annotation.trim());
  if (validItems.length > 0) {
    sections.push(validItems.map(item => `[${item.completed ? 'x' : ' '}] ${item.text.trim()}`).join('\n'));
  }
  return sections.join('\n\n');
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function NoteForm({ notes, customers, currentUser, onSave, onUpdate }: NoteFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(id);
  const { canCreateEntity, canEditEntity } = useAuth();
  const canManageNote = isEditing ? canEditEntity('notes') : canCreateEntity('notes');
  const preselectedCustomer = !isEditing
    ? customers.find(customer => customer.id === searchParams.get('clientId'))
    : undefined;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [assignedTo, setAssignedTo] = useState<'maxi' | 'ludmila' | 'both' | 'unassigned'>('unassigned');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [status, setStatus] = useState<'pending' | 'in_progress' | 'completed' | 'cancelled'>('pending');
  const [category, setCategory] = useState<Note['category']>(preselectedCustomer ? 'client' : 'general');
  const [hasDueDate, setHasDueDate] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // New fields
  const [customerId, setCustomerId] = useState<number | null>(() => preselectedCustomer ? parseInt(preselectedCustomer.id) : null);
  const [customerName, setCustomerName] = useState(() => preselectedCustomer
    ? preselectedCustomer.company
      ? `${preselectedCustomer.firstName} ${preselectedCustomer.lastName} (${preselectedCustomer.company})`
      : `${preselectedCustomer.firstName} ${preselectedCustomer.lastName}`
    : '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [documentType, setDocumentType] = useState<'none' | 'budget' | 'invoice'>('none');
  const [documentNumber, setDocumentNumber] = useState('');

  const [error, setError] = useState('');

  // Filter customers for search (sin importar acentos)
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 10);
    const search = normalize(customerSearch);
    return customers.filter(c =>
      normalize(`${c.firstName} ${c.lastName}`).includes(search) ||
      (c.company && normalize(c.company).includes(search)) ||
      (c.cuit && c.cuit.includes(customerSearch.trim()))
    ).slice(0, 10);
  }, [customers, customerSearch]);

  useEffect(() => {
    if (isEditing && id) {
      const note = notes.find(n => n.id === id);
      if (note) {
        const parsedContent = parseNoteContent(note.content || '');
        setTitle(note.title);
        setContent(parsedContent.annotation);
        setChecklistItems(parsedContent.items);
        setAssignedTo(note.assignedTo);
        setPriority(note.priority);
        setStatus(note.status);
        setCategory(note.category);
        if (note.dueDate) {
          setHasDueDate(true);
          setDueDate(note.dueDate);
        }
        // Load new fields
        if (note.customerId) {
          setCustomerId(note.customerId);
          setCustomerName(note.customerName || '');
        }
        setDocumentType(note.documentType || 'none');
        setDocumentNumber(note.documentNumber || '');
      }
    }
  }, [id, notes, isEditing]);

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerId(parseInt(customer.id));
    const name = customer.company
      ? `${customer.firstName} ${customer.lastName} (${customer.company})`
      : `${customer.firstName} ${customer.lastName}`;
    setCustomerName(name);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  };

  const handleClearCustomer = () => {
    setCustomerId(null);
    setCustomerName('');
    setCustomerSearch('');
  };

  const addChecklistItem = () => {
    const itemText = newChecklistItem.trim();
    if (!itemText) return;
    setChecklistItems(currentItems => [...currentItems, createChecklistItem(itemText)]);
    setStatus('pending');
    setNewChecklistItem('');
  };

  const toggleChecklistItem = (itemId: string) => {
    const currentItem = checklistItems.find(item => item.id === itemId);
    if (currentItem?.completed) setStatus('pending');
    setChecklistItems(currentItems => currentItems.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ));
  };

  const updateChecklistItem = (itemId: string, text: string) => {
    setChecklistItems(currentItems => currentItems.map(item =>
      item.id === itemId ? { ...item, text } : item
    ));
  };

  const removeChecklistItem = (itemId: string) => {
    setChecklistItems(currentItems => currentItems.filter(item => item.id !== itemId));
  };

  const applyChecklistTemplate = (template: typeof CHECKLIST_TEMPLATES[number]) => {
    setChecklistItems(currentItems => {
      const existingItems = new Set(currentItems.map(item => normalize(item.text)));
      const newItems = template.items
        .filter(itemText => !existingItems.has(normalize(itemText)))
        .map(itemText => createChecklistItem(itemText));
      return [...currentItems, ...newItems];
    });
    if (!title.trim()) setTitle(template.defaultTitle);
    setPriority(template.priority);
    setStatus('pending');
  };

  const setQuickDueDate = (daysFromToday: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);
    setHasDueDate(true);
    setDueDate(formatDateInput(date));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    // El contenido es opcional: para tareas rápidas alcanza con el título
    if (hasDueDate && !dueDate) {
      setError('Elegí la fecha de vencimiento o desactivá el interruptor');
      return;
    }
    if (status === 'completed' && checklistItems.some(item => item.text.trim() && !item.completed)) {
      setError('No podés completar la nota porque todavía hay pasos pendientes');
      return;
    }

    const formData: NoteFormData = {
      title: title.trim(),
      content: serializeNoteContent(content, checklistItems),
      assignedTo,
      priority,
      status,
      category,
      dueDate: hasDueDate ? dueDate : undefined,
      customerId: customerId,
      customerName: customerName,
      documentType,
      documentNumber: documentNumber.trim(),
    };

    setIsSaving(true);
    try {
      if (isEditing && id) {
        await onUpdate(id, formData);
      } else {
        await onSave(formData, currentUser.id, currentUser.name);
      }
      navigate('/notes');
    } catch (err) {
      setError('Error al guardar la nota. Probá de nuevo.');
      setIsSaving(false);
    }
  };

  if (!canManageNote) {
    return <Navigate to="/notes" replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 overflow-x-clip p-3 pb-36 sm:space-y-6 sm:p-4 sm:pb-36 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/notes')}>
          <ArrowLeft className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Volver</span>
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">
          {isEditing ? 'Editar nota' : 'Nueva nota o pendiente'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form id="note-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Información básica */}
        <Card className="min-h-0 py-0 gap-0">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileText className="w-5 h-5 text-sky-600" />
              Información de la Nota
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Llamar al proveedor de caños"
                autoFocus={!isEditing}
                className="h-11 text-base sm:h-10 sm:text-sm"
              />
            </div>

            <div>
              <Label>Anotaciones <span className="text-slate-400 text-xs font-normal">(opcional)</span></Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Teléfonos, medidas, repuestos, acuerdos, observaciones o cualquier dato importante..."
                rows={4}
                className="min-h-28 text-base sm:text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Las anotaciones se mostrarán separadas de la lista de pendientes.</p>
            </div>
          </CardContent>
        </Card>

        {/* Lista de pendientes dentro de la nota */}
        <Card className="min-h-0 gap-0 overflow-hidden py-0">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Check className="h-4 w-4" />
                  </span>
                  Lista de pendientes
                </CardTitle>
                <p className="mt-1 text-xs text-slate-500">Dividí el trabajo en pasos y marcá cada avance.</p>
              </div>
              {checklistItems.length > 0 && (
                <span className="flex-shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
                  {checklistItems.filter(item => item.completed).length}/{checklistItems.length}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Plantillas rápidas</p>
              <div className="grid grid-cols-3 gap-2">
                {CHECKLIST_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    type="button"
                    className="min-h-16 touch-manipulation rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-xs font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
                    onClick={() => applyChecklistTemplate(template)}
                  >
                    <span className="mb-1 block text-lg" aria-hidden="true">{template.icon}</span>
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 gap-2">
              <Input
                value={newChecklistItem}
                onChange={(event) => setNewChecklistItem(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Ej: Pedir precio del compresor"
                aria-label="Nuevo pendiente"
                className="h-11 min-w-0 flex-1 text-base sm:h-10 sm:text-sm"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-11 flex-shrink-0 touch-manipulation px-3 sm:h-10"
                onClick={addChecklistItem}
                disabled={!newChecklistItem.trim()}
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Agregar</span>
              </Button>
            </div>

            {checklistItems.length > 0 ? (
              <div className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round((checklistItems.filter(item => item.completed).length / checklistItems.length) * 100)}%` }}
                  />
                </div>
                <div className="space-y-2">
                  {checklistItems.map((item, index) => (
                    <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                      <button
                        type="button"
                        aria-label={item.completed ? `Reabrir pendiente ${index + 1}` : `Completar pendiente ${index + 1}`}
                        className={`flex h-11 w-11 flex-shrink-0 touch-manipulation items-center justify-center rounded-lg border-2 transition-colors sm:h-9 sm:w-9 ${
                          item.completed
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-slate-300 bg-white text-transparent hover:border-emerald-400'
                        }`}
                        onClick={() => toggleChecklistItem(item.id)}
                      >
                        <Check className="h-5 w-5" strokeWidth={3} />
                      </button>
                      <Input
                        value={item.text}
                        onChange={(event) => updateChecklistItem(item.id, event.target.value)}
                        aria-label={`Texto del pendiente ${index + 1}`}
                        className={`h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 sm:h-9 sm:text-sm ${item.completed ? 'text-slate-400 line-through' : ''}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar pendiente ${index + 1}`}
                        className="h-11 w-11 flex-shrink-0 touch-manipulation text-slate-400 hover:bg-red-50 hover:text-red-600 sm:h-9 sm:w-9"
                        onClick={() => removeChecklistItem(item.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
                <p className="text-sm font-medium text-slate-600">Todavía no agregaste pendientes</p>
                <p className="mt-1 text-xs text-slate-500">Escribí uno o usá una plantilla para empezar.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cliente y Documento */}
        <Card className="min-h-0 py-0 gap-0">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Building2 className="w-5 h-5 text-sky-600" />
              Cliente y Documento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-4">
            {/* Customer selector */}
            <div>
              <Label>Cliente <span className="text-slate-400 text-xs font-normal">(opcional)</span></Label>
              {customerId ? (
                <div className="flex items-center gap-2 mt-1 p-2.5 bg-sky-50 border border-sky-200 rounded-lg">
                  <User className="w-4 h-4 text-sky-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-sky-800 flex-1 truncate">{customerName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon" aria-label="Quitar cliente seleccionado"
                    className="h-11 w-11 touch-manipulation text-slate-400 hover:text-red-500 sm:h-6 sm:w-6"
                    onClick={handleClearCustomer}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  {/* Fondo invisible para cerrar el desplegable tocando afuera */}
                  {showCustomerDropdown && (
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowCustomerDropdown(false)}
                    />
                  )}
                  <div className="relative z-50">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      placeholder="Buscar por nombre, empresa o CUIT..."
                      className="h-11 pl-10 text-base sm:h-10 sm:text-sm"
                    />
                  </div>
                  {showCustomerDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">No se encontraron clientes</div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex min-h-11 w-full touch-manipulation items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-sky-50"
                            onClick={() => handleSelectCustomer(c)}
                          >
                            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <span className="font-medium text-slate-800">{c.firstName} {c.lastName}</span>
                              {c.company && <span className="text-slate-500 ml-1">({c.company})</span>}
                              {c.cuit && <span className="text-slate-400 ml-2 text-xs">CUIT: {c.cuit}</span>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Document type */}
            <div>
              <Label>Tipo de Documento</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(Object.entries(DOCUMENT_TYPE_OPTIONS) as [string, { label: string; icon: string }][]).map(([key, { label, icon }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDocumentType(key as any)}
                    className={`
                      min-h-11 touch-manipulation p-2.5 rounded-lg border text-center transition-all text-sm
                      ${documentType === key
                        ? 'ring-2 ring-sky-400 ring-offset-1 bg-sky-50 border-sky-200 text-sky-800 font-medium'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }
                    `}
                  >
                    <span className="mr-1">{icon}</span> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Document number */}
            {documentType !== 'none' && (
              <div>
                <Label>
                  <Receipt className="w-4 h-4 inline mr-1" />
                  N° de {documentType === 'budget' ? 'Presupuesto' : 'Factura'}
                </Label>
                <Input
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder={documentType === 'budget' ? 'Ej: PRES-2602-001' : 'Ej: A-0001-00012345'}
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Asignación y Prioridad */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <Card className="min-h-0 py-0 gap-0">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <User className="w-5 h-5 text-sky-600" />
                Asignación
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-4">
              <div>
                <Label>Asignar a</Label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value as any)}
                  className="w-full min-h-11 p-2 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {Object.entries(ASSIGNED_TO_OPTIONS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Categoría</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full min-h-11 p-2 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {Object.entries(NOTE_CATEGORIES).map(([key, { label, icon }]) => (
                    <option key={key} value={key}>{icon} {label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Estado</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full min-h-11 p-2 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {Object.entries(NOTE_STATUS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 py-0 gap-0">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Flag className="w-5 h-5 text-sky-600" />
                Prioridad y Fecha
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-4">
              <div>
                <Label>Nivel de Urgencia</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {Object.entries(PRIORITY_OPTIONS).map(([key, { label, color }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPriority(key as any)}
                      className={`
                        p-3 rounded-lg border text-left transition-all
                        ${priority === key
                          ? `ring-2 ring-offset-1 ${color.replace('bg-', 'ring-').replace('100', '400')}`
                          : 'border-slate-200 hover:border-slate-300'
                        }
                        ${color}
                      `}
                    >
                      <span className="font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 p-3">
                <Switch
                  id="note-has-due-date"
                  checked={hasDueDate}
                  onCheckedChange={setHasDueDate}
                />
                <div>
                  <Label htmlFor="note-has-due-date" className="cursor-pointer">Tiene fecha de vencimiento</Label>
                </div>
              </div>

              <div>
                <Label>Fecha rápida</Label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <Button type="button" variant="outline" className="min-h-11 touch-manipulation px-2 text-xs" onClick={() => setQuickDueDate(0)}>
                    Hoy
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11 touch-manipulation px-2 text-xs" onClick={() => setQuickDueDate(1)}>
                    Mañana
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11 touch-manipulation px-2 text-xs" onClick={() => setQuickDueDate(7)}>
                    +7 días
                  </Button>
                </div>
              </div>

              {hasDueDate && (
                <div>
                  <Label>Fecha de vencimiento</Label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-11 text-base sm:h-10 sm:text-sm"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <Card className="bg-slate-50 min-h-0 py-0 gap-0">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Vista previa</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded text-sm ${(PRIORITY_OPTIONS[priority] ?? PRIORITY_OPTIONS.medium).color}`}>
                <Flag className="w-3 h-3 inline mr-1" />
                {(PRIORITY_OPTIONS[priority] ?? PRIORITY_OPTIONS.medium).label}
              </span>
              <span className={`px-2 py-1 rounded text-sm ${(ASSIGNED_TO_OPTIONS[assignedTo] ?? ASSIGNED_TO_OPTIONS.unassigned).color}`}>
                <User className="w-3 h-3 inline mr-1" />
                {(ASSIGNED_TO_OPTIONS[assignedTo] ?? ASSIGNED_TO_OPTIONS.unassigned).label}
              </span>
              <span className="px-2 py-1 rounded text-sm bg-slate-200 text-slate-700">
                <Tag className="w-3 h-3 inline mr-1" />
                {(NOTE_CATEGORIES[category] ?? { label: category }).label}
              </span>
              {customerName && (
                <span className="px-2 py-1 rounded text-sm bg-sky-100 text-sky-700">
                  <Building2 className="w-3 h-3 inline mr-1" />
                  {customerName}
                </span>
              )}
              {documentType !== 'none' && (
                <span className="px-2 py-1 rounded text-sm bg-amber-100 text-amber-700">
                  <Receipt className="w-3 h-3 inline mr-1" />
                  {DOCUMENT_TYPE_OPTIONS[documentType].label}{documentNumber ? `: ${documentNumber}` : ''}
                </span>
              )}
              {hasDueDate && dueDate && (
                <span className="px-2 py-1 rounded text-sm bg-slate-200 text-slate-700">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Vence: {parseLocalDate(dueDate).toLocaleDateString('es-AR')}
                </span>
              )}
              {checklistItems.length > 0 && (
                <span className="rounded bg-emerald-100 px-2 py-1 text-sm text-emerald-700">
                  <Check className="mr-1 inline h-3 w-3" />
                  {checklistItems.filter(item => item.completed).length}/{checklistItems.length} pasos completos
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Botones: por encima de la navegación inferior en celular */}
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex gap-2 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:relative lg:inset-auto lg:z-auto lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <Button type="button" variant="outline" className="h-11 flex-1 touch-manipulation sm:h-10 sm:flex-none" onClick={() => navigate('/notes')} disabled={isSaving}>
            Cancelar
          </Button>
          <Button form="note-form" type="submit" className="h-11 flex-1 touch-manipulation bg-sky-600 hover:bg-sky-700 sm:h-10 sm:flex-none" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Nota'}
          </Button>
        </div>
      </form>
    </div>
  );
}
