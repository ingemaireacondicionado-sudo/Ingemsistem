import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Save, Calendar, Clock, User, Package, MapPin, FileText, Wrench, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Appointment, AppointmentFormData } from '@/types/appointment';
import { DURATION_OPTIONS, APPOINTMENT_STATUS, RECURRENCE_OPTIONS } from '@/types/appointment';
import { Repeat } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { mapsUrl } from '@/lib/contactUtils';

interface AppointmentCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  company?: string;
  address?: string;
  city?: string;
  country?: string;
}

function buildCustomerWorkAddress(customer?: AppointmentCustomer): string {
  if (!customer) return '';
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

interface AppointmentFormProps {
  appointments: Appointment[];
  customers: AppointmentCustomer[];
  products: { id: string; name: string }[];
  technicians: { id: string; firstName: string; lastName: string; specialty: string; isActive: boolean; hasInsurance: boolean; hasCriminalRecord: boolean; hasPlatformDocuments: boolean }[];
  onSave: (data: AppointmentFormData, clientName: string, clientPhone: string, productNames: string[], technicianNames: string[]) => string | Promise<string>;
  onUpdate: (id: string, data: AppointmentFormData, clientName: string, clientPhone: string, productNames: string[], technicianNames: string[]) => void | Promise<void>;
}

export function AppointmentForm({ appointments, customers, products, technicians, onSave, onUpdate }: AppointmentFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(id);
  const { canCreateEntity, canEditEntity } = useAuth();
  const canManageAppointment = isEditing
    ? canEditEntity('appointments')
    : canCreateEntity('appointments');

  const locationState = location.state as { date?: string; time?: string; clientId?: string } | null;
  const preselectedDate = locationState?.date;
  const preselectedTime = locationState?.time;
  const preselectedClientId = locationState?.clientId || searchParams.get('clientId') || '';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(isEditing ? '' : preselectedClientId);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedTechnicians, setSelectedTechnicians] = useState<string[]>([]);
  const [date, setDate] = useState(() => {
    if (preselectedDate) return preselectedDate;
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  });
  const [time, setTime] = useState(preselectedTime || '09:00');
  const [duration, setDuration] = useState(60);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'completed' | 'cancelled'>('pending');
  const [address, setAddress] = useState('');
  const [addressSource, setAddressSource] = useState<'customer' | 'manual'>('customer');
  const [notes, setNotes] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<'none' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditing && id) {
      const appointment = appointments.find(a => a.id === id);
      if (appointment) {
        setTitle(appointment.title);
        setDescription(appointment.description);
        setClientId(appointment.clientId);
        setSelectedProducts(appointment.productIds);
        setSelectedTechnicians(appointment.technicianIds);
        setDate(appointment.date);
        setTime(appointment.time);
        setDuration(appointment.duration);
        setStatus(appointment.status);
        setAddress(appointment.address);
        setAddressSource('manual');
        setNotes(appointment.notes);
        setRecurrenceType(appointment.recurrenceType || 'none');
        setRecurrenceEndDate(appointment.recurrenceEndDate || '');
      }
    }
  }, [id, appointments, isEditing]);

  // Completar calle, localidad y provincia sin pisar una dirección escrita manualmente.
  useEffect(() => {
    if (clientId && !isEditing && addressSource === 'customer') {
      const customer = customers.find(c => c.id === clientId);
      setAddress(buildCustomerWorkAddress(customer));
    }
  }, [clientId, customers, isEditing, addressSource]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError('');

    if (!title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    if (!clientId) {
      setError('Debes seleccionar un cliente');
      return;
    }
    if (!date) {
      setError('La fecha es obligatoria');
      return;
    }
    if (!time) {
      setError('La hora es obligatoria');
      return;
    }
    if (!address.trim()) {
      setError('La dirección del trabajo es obligatoria. Completala en el cliente o escribila en el turno.');
      return;
    }
    const appointmentCustomer = customers.find(customer => customer.id === clientId);
    if (
      addressSource === 'customer' &&
      appointmentCustomer &&
      !(appointmentCustomer.address?.trim() && appointmentCustomer.city?.trim() && appointmentCustomer.country?.trim())
    ) {
      setError('La dirección guardada está incompleta. Completá localidad y provincia o escribí la dirección completa en este turno.');
      return;
    }

    const toMinutes = (value: string) => {
      const [hours, minutes] = value.split(':').map(Number);
      return hours * 60 + minutes;
    };
    const startMinutes = toMinutes(time);
    const endMinutes = startMinutes + duration;
    const conflictingAppointment = appointments.find(appointment => {
      if (appointment.id === id || appointment.status === 'cancelled' || appointment.date !== date) return false;
      if (!appointment.technicianIds.some(technicianId => selectedTechnicians.includes(technicianId))) return false;
      const appointmentStart = toMinutes(appointment.time);
      const appointmentEnd = appointmentStart + appointment.duration;
      return startMinutes < appointmentEnd && appointmentStart < endMinutes;
    });
    if (conflictingAppointment) {
      setError(`Hay un técnico ocupado en ese horario (${conflictingAppointment.time}, ${conflictingAppointment.title})`);
      return;
    }

    const customer = customers.find(c => c.id === clientId);
    if (!customer) {
      setError('Cliente no encontrado');
      return;
    }

    const productNames = selectedProducts
      .map(pid => products.find(p => p.id === pid)?.name)
      .filter(Boolean) as string[];

    const technicianNames = selectedTechnicians
      .map(tid => {
        const tech = technicians.find(t => t.id === tid);
        return tech ? `${tech.firstName} ${tech.lastName}` : '';
      })
      .filter(Boolean) as string[];

    // Validate recurrence
    if (recurrenceType !== 'none' && !recurrenceEndDate) {
      setError('Debes indicar hasta cuándo se repite el turno');
      return;
    }
    if (recurrenceType !== 'none' && recurrenceEndDate < date) {
      setError('La fecha final de repetición no puede ser anterior al turno');
      return;
    }

    const formData: AppointmentFormData = {
      title: title.trim(),
      description: description.trim(),
      clientId,
      productIds: selectedProducts,
      technicianIds: selectedTechnicians,
      date,
      time,
      duration,
      status,
      address: address.trim(),
      notes: notes.trim(),
      recurrenceType,
      recurrenceEndDate,
    };

    setIsSaving(true);
    try {
      if (isEditing && id) {
        await onUpdate(id, formData, `${customer.firstName} ${customer.lastName}`, customer.phone, productNames, technicianNames);
      } else {
        await onSave(formData, `${customer.firstName} ${customer.lastName}`, customer.phone, productNames, technicianNames);
      }
      navigate('/calendar');
    } catch {
      setError('Error al guardar el turno. Revisá la conexión y probá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleTechnician = (technicianId: string) => {
    setSelectedTechnicians(prev =>
      prev.includes(technicianId)
        ? prev.filter(id => id !== technicianId)
        : [...prev, technicianId]
    );
  };

  const selectedCustomer = customers.find(c => c.id === clientId);
  const selectedCustomerAddress = buildCustomerWorkAddress(selectedCustomer);
  const hasCompleteSelectedCustomerAddress = Boolean(
    selectedCustomer?.address?.trim() && selectedCustomer?.city?.trim() && selectedCustomer?.country?.trim()
  );
  const isUsingCustomerAddress = Boolean(
    selectedCustomerAddress && address.trim().toLocaleLowerCase('es-AR') === selectedCustomerAddress.toLocaleLowerCase('es-AR')
  );

  const handleCustomerChange = (nextClientId: string) => {
    const nextCustomer = customers.find(customer => customer.id === nextClientId);
    setClientId(nextClientId);
    setAddressSource('customer');
    setAddress(buildCustomerWorkAddress(nextCustomer));
  };

  // Filtrar solo técnicos activos
  const activeTechnicians = technicians.filter(t => t.isActive);

  if (!canManageAppointment) {
    return <Navigate to="/calendar" replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 overflow-x-clip p-2 pb-36 sm:space-y-6 sm:p-4 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Button variant="outline" size="sm" className="h-11 touch-manipulation sm:h-10" onClick={() => navigate('/calendar')}>
          <ArrowLeft className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Volver</span>
        </Button>
        <h1 className="text-lg sm:text-2xl font-bold text-slate-800">
          {isEditing ? 'Editar Turno' : 'Nuevo Turno'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Información básica */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Información del Turno
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div>
              <Label className="text-sm">Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Instalación Aire Acondicionado"
                className="h-11 sm:h-9 text-base sm:text-sm"
              />
            </div>

            <div>
              <Label className="text-sm">Descripción</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción del trabajo a realizar"
                rows={3}
                className="text-base sm:text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Cliente */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div>
              <Label className="text-sm">Seleccionar Cliente *</Label>
              <select
                value={clientId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
              >
                <option value="">Seleccionar cliente...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company?.trim() || `${customer.firstName} ${customer.lastName}`.trim()} - {customer.phone}
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer && (
              <div className={`rounded-lg border p-3 sm:p-4 ${hasCompleteSelectedCustomerAddress ? 'border-sky-100 bg-sky-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base">
                      {selectedCustomer.company?.trim() || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim()}
                    </p>
                    {selectedCustomer.company && `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim() !== selectedCustomer.company.trim() && (
                      <p className="text-xs text-slate-500">Contacto: {selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                    )}
                    <p className="text-xs sm:text-sm text-slate-500">{selectedCustomer.phone}</p>
                  </div>
                  {hasCompleteSelectedCustomerAddress ? (
                    <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
                  )}
                </div>
                {selectedCustomerAddress ? (
                  <div className="mt-2">
                    <p className="flex items-start gap-1.5 text-xs text-slate-600 sm:text-sm">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span className="break-words">{selectedCustomerAddress}</span>
                    </p>
                    {!hasCompleteSelectedCustomerAddress && (
                      <p className="mt-1 text-xs font-medium text-amber-700">Falta completar calle, localidad o provincia en la ficha.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-medium text-amber-700">Este cliente no tiene una dirección guardada.</p>
                )}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <Label className="text-sm">Dirección del trabajo *</Label>
                {selectedCustomerAddress && !isUsingCustomerAddress && (
                  <button
                    type="button"
                    className="min-h-9 touch-manipulation text-xs font-medium text-sky-700 hover:text-sky-800"
                    onClick={() => {
                      setAddress(selectedCustomerAddress);
                      setAddressSource('customer');
                    }}
                  >
                    Usar la guardada
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <Input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setAddressSource('manual');
                  }}
                  placeholder="Calle, número, localidad y provincia"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div className="mt-1.5 flex min-h-5 items-center justify-between gap-2 pl-6">
                <p className={`text-xs ${isUsingCustomerAddress ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {isUsingCustomerAddress
                    ? hasCompleteSelectedCustomerAddress
                      ? 'Dirección completa tomada de la ficha del cliente'
                      : 'Dirección tomada de la ficha. Revisá que tenga localidad y provincia'
                    : 'Podés cambiarla si el trabajo se realiza en otra ubicación'}
                </p>
                {address.trim() && (
                  <a
                    href={mapsUrl(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 flex-shrink-0 touch-manipulation items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800"
                  >
                    Mapa <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Equipos */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Equipos / Productos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <p className="text-xs sm:text-sm text-slate-500 mb-3">
              Selecciona los equipos que se instalarán o revisarán:
            </p>
            <div className="flex flex-wrap gap-2">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggleProduct(product.id)}
                  className={`
                    px-3 py-2 rounded-lg text-sm border transition-all min-h-[44px] sm:min-h-0
                    ${selectedProducts.includes(product.id)
                      ? 'bg-sky-100 border-sky-500 text-sky-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 active:bg-slate-50'
                    }
                  `}
                >
                  <Package className="w-3 h-3 inline mr-1" />
                  {product.name}
                </button>
              ))}
            </div>
            {selectedProducts.length > 0 && (
              <p className="text-xs sm:text-sm text-slate-500 mt-3">
                {selectedProducts.length} equipo(s) seleccionado(s)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Técnicos */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Técnicos Asignados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <p className="text-xs sm:text-sm text-slate-500 mb-3">
              Selecciona los técnicos que realizarán el trabajo:
            </p>
            {activeTechnicians.length === 0 ? (
              <div className="text-center py-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">No hay técnicos activos disponibles</p>
                <Button 
                  type="button"
                  variant="link" 
                  className="text-sky-600"
                  onClick={() => navigate('/technicians/new')}
                >
                  Agregar técnico
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {activeTechnicians.map((tech) => {
                  const isSelected = selectedTechnicians.includes(tech.id);
                  const hasAllDocs = tech.hasInsurance && tech.hasCriminalRecord && tech.hasPlatformDocuments;
                  
                  return (
                    <button
                      key={tech.id}
                      type="button"
                      onClick={() => toggleTechnician(tech.id)}
                      className={`
                        w-full flex items-center justify-between p-3 sm:p-3 rounded-lg border transition-all text-left min-h-[56px]
                        ${isSelected
                          ? 'bg-sky-50 border-sky-500'
                          : 'bg-white border-slate-200 hover:border-slate-300 active:bg-slate-50'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-semibold text-xs sm:text-sm flex-shrink-0
                          ${isSelected ? 'bg-sky-600' : 'bg-slate-400'}
                        `}>
                          {tech.firstName[0]}{tech.lastName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className={`font-medium text-sm sm:text-base truncate ${isSelected ? 'text-sky-900' : 'text-slate-700'}`}>
                            {tech.firstName} {tech.lastName}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{tech.specialty}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!hasAllDocs && (
                          <span title="Falta documentación">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          </span>
                        )}
                        {isSelected && (
                          <CheckCircle className="w-5 h-5 text-sky-600" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedTechnicians.length > 0 && (
              <p className="text-xs sm:text-sm text-slate-500 mt-3">
                {selectedTechnicians.length} técnico(s) asignado(s)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Fecha y hora */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Fecha y Hora
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Fecha *</Label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-11 sm:h-9 text-base sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">Hora *</Label>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-11 sm:h-9 text-base sm:text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Duración estimada</Label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm">Estado</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {Object.entries(APPOINTMENT_STATUS).map(([key, { label }]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recurrencia */}
        {!isEditing && (
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Repeat className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
                Repetición
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
              <div>
                <Label className="text-sm">Tipo de repetición</Label>
                <select
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value as any)}
                  className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Ideal para mantenimientos programados o visitas periódicas
                </p>
              </div>

              {recurrenceType !== 'none' && (
                <div>
                  <Label className="text-sm">Repetir hasta *</Label>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    min={date}
                    className="h-11 sm:h-9 text-base sm:text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Se crearán turnos automáticamente hasta esta fecha
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notas */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Notas adicionales</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas, recordatorios, materiales necesarios..."
              rows={4}
              className="text-base sm:text-sm"
            />
          </CardContent>
        </Card>

        {/* Botones - fijos en móvil */}
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex gap-2 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:relative lg:inset-auto lg:z-auto lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <Button type="button" variant="outline" className="flex-1 sm:flex-none h-11 sm:h-10" onClick={() => navigate('/calendar')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving} className="flex-1 sm:flex-none bg-sky-600 hover:bg-sky-700 h-11 sm:h-10">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Turno'}
          </Button>
        </div>
      </form>
    </div>
  );
}
