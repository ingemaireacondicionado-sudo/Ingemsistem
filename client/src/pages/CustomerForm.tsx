import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Hash,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Customer, CustomerFormData } from '@/types/customer';
import { useAuth } from '@/contexts/AuthContext';
import { mapsUrl } from '@/lib/contactUtils';

interface CustomerFormProps {
  customers: Customer[];
  onSave: (data: CustomerFormData) => string | Promise<string>;
  onUpdate: (id: string, data: CustomerFormData) => void | Promise<void>;
}

const emptyFormData: CustomerFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  cuit: '',
  company: '',
  position: '',
  status: 'prospect',
  customerType: 'company',
  address: '',
  city: '',
  country: '',
  notes: '',
};

function buildFullCustomerAddress(data: Pick<CustomerFormData, 'address' | 'city' | 'country'>): string {
  const parts = [data.address, data.city, data.country]
    .map(part => part.trim())
    .filter(Boolean);

  return parts.filter((part, index) => {
    const normalizedPart = part.toLocaleLowerCase('es-AR');
    return !parts.slice(0, index).some(previousPart =>
      previousPart.toLocaleLowerCase('es-AR').includes(normalizedPart)
    );
  }).join(', ');
}

export function CustomerForm({ customers, onSave, onUpdate }: CustomerFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { canCreateEntity, canEditEntity } = useAuth();
  const canManageCustomer = isEditing
    ? canEditEntity('customers')
    : canCreateEntity('customers');

  const [formData, setFormData] = useState<CustomerFormData>(emptyFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCompany = formData.customerType === 'company';
  const fullAddress = buildFullCustomerAddress(formData);
  const hasStreetAddress = Boolean(formData.address.trim());
  const hasCompleteAddress = Boolean(formData.address.trim() && formData.city.trim() && formData.country.trim());

  useEffect(() => {
    if (isEditing && id) {
      const customer = customers.find(c => c.id === id);
      if (customer) {
        setFormData({
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          cuit: customer.cuit || '',
          company: customer.company,
          position: customer.position,
          status: customer.status,
          customerType: customer.customerType,
          address: customer.address,
          city: customer.city,
          country: customer.country,
          notes: customer.notes,
        });
      } else {
        navigate('/customers');
      }
    }
  }, [id, customers, isEditing, navigate]);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CustomerFormData, string>> = {};

    if (isCompany) {
      // Para empresa: nombre de empresa obligatorio, contacto opcional pero recomendado
      if (!formData.company.trim()) {
        newErrors.company = 'El nombre de la empresa es obligatorio';
      }
      if (!formData.phone.trim()) {
        newErrors.phone = 'El teléfono es obligatorio';
      }
    } else {
      // Para persona: nombre y apellido obligatorios
      if (!formData.firstName.trim()) {
        newErrors.firstName = 'El nombre es obligatorio';
      }
      if (!formData.lastName.trim()) {
        newErrors.lastName = 'El apellido es obligatorio';
      }
      if (!formData.phone.trim()) {
        newErrors.phone = 'El teléfono es obligatorio';
      }
    }

    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (formData.phone.trim() && phoneDigits.length < 8) {
      newErrors.phone = 'Ingresá un teléfono válido con código de área';
    }

    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Ingresá un email válido';
    }

    const normalizedCuit = formData.cuit.replace(/\D/g, '');
    if (normalizedCuit && customers.some(customer =>
      customer.id !== id && (customer.cuit || '').replace(/\D/g, '') === normalizedCuit
    )) {
      newErrors.cuit = 'Ya existe un cliente con este CUIT, CUIL o DNI';
    }

    if (formData.status === 'active' && !formData.address.trim()) {
      newErrors.address = 'Agregá la dirección principal para poder agendar visitas correctamente';
    }
    if (formData.address.trim() && !formData.city.trim()) {
      newErrors.city = 'Agregá la localidad para completar la dirección';
    }
    if (formData.address.trim() && !formData.country.trim()) {
      newErrors.country = 'Agregá la provincia para completar la dirección';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Si es empresa y no se puso nombre/apellido, usar datos de empresa
      const dataToSave: CustomerFormData = {
        ...formData,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        cuit: formData.cuit.trim(),
        company: formData.company.trim(),
        position: formData.position.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        country: formData.country.trim(),
        notes: formData.notes.trim(),
      };
      if (isCompany) {
        if (!dataToSave.firstName.trim()) {
          dataToSave.firstName = dataToSave.company;
        }
        if (!dataToSave.lastName.trim()) {
          dataToSave.lastName = '';
        }
      }

      if (isEditing && id) {
        await onUpdate(id, dataToSave);
        navigate(`/customers/${id}`);
      } else {
        const newId = await onSave(dataToSave);
        navigate(`/customers/${newId}`);
      }
    } catch {
      setErrors(prev => ({ ...prev, firstName: 'Error al guardar. Revisá la conexión y probá de nuevo.' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof CustomerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleTypeChange = (type: 'company' | 'individual') => {
    setFormData(prev => ({
      ...prev,
      customerType: type,
      // Limpiar campos que no aplican al cambiar tipo
      ...(type === 'company' ? { position: prev.position } : { position: '' }),
    }));
    setErrors({});
  };

  if (!canManageCustomer) {
    return <Navigate to="/customers" replace />;
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-36 sm:space-y-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={isEditing ? `/customers/${id}` : '/customers'}>
          <Button variant="ghost" size="icon" aria-label="Volver a clientes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isEditing ? 'Actualiza la información del cliente' : 'Completa los datos para crear un nuevo cliente'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 [&_input]:min-h-11 [&_input]:text-base sm:[&_input]:min-h-10 sm:[&_input]:text-sm">
        {/* Tipo de Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tipo de Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleTypeChange('company')}
                className={`flex min-h-28 touch-manipulation flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all sm:gap-3 sm:p-6 ${
                  isCompany
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  isCompany ? 'bg-blue-500' : 'bg-gray-200'
                }`}>
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div className="text-center">
                  <p className={`font-semibold ${isCompany ? 'text-blue-700' : 'text-gray-700'}`}>
                    Empresa
                  </p>
                  <p className="text-sm text-gray-500">Cliente corporativo</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('individual')}
                className={`flex min-h-28 touch-manipulation flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all sm:gap-3 sm:p-6 ${
                  !isCompany
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  !isCompany ? 'bg-purple-500' : 'bg-gray-200'
                }`}>
                  <User className="w-7 h-7 text-white" />
                </div>
                <div className="text-center">
                  <p className={`font-semibold ${!isCompany ? 'text-purple-700' : 'text-gray-700'}`}>
                    Persona
                  </p>
                  <p className="text-sm text-gray-500">Cliente individual</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* ====== CAMPOS PARA EMPRESA ====== */}
        {isCompany && (
          <>
            {/* Datos de la Empresa */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-lg">Datos de la Empresa</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company">
                    Nombre de la Empresa <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => handleChange('company', e.target.value)}
                      placeholder="Ej: INGEM Termomecánica"
                      className={`pl-10 ${errors.company ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.company && (
                    <p className="text-sm text-red-500">{errors.company}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cuit">CUIT</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="cuit"
                        value={formData.cuit}
                        onChange={(e) => handleChange('cuit', e.target.value)}
                        placeholder="Ej: 30-12345678-9"
                        className={`pl-10 ${errors.cuit ? 'border-red-500' : ''}`}
                        aria-invalid={Boolean(errors.cuit)}
                      />
                    </div>
                    {errors.cuit && <p className="text-sm text-red-500">{errors.cuit}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Estado</Label>
                    <Select 
                      value={formData.status} 
                      onValueChange={(value: 'active' | 'inactive' | 'prospect') => handleChange('status', value)}
                    >
                      <SelectTrigger className="min-h-11 text-base sm:min-h-10 sm:text-sm">
                        <SelectValue placeholder="Selecciona un estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                        </SelectItem>
                        <SelectItem value="inactive">
                          <Badge className="bg-gray-100 text-gray-700">Inactivo</Badge>
                        </SelectItem>
                        <SelectItem value="prospect">
                          <Badge className="bg-amber-100 text-amber-700">Cliente Potencial</Badge>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      Teléfono de la Empresa <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="+54 11 5467 3062"
                        className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-sm text-red-500">{errors.phone}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email de la Empresa</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="info@empresa.com"
                        className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-sm text-red-500">{errors.email}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Persona de Contacto (opcional para empresa) */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-lg">Persona de Contacto <span className="text-sm font-normal text-gray-400">(opcional)</span></CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nombre del contacto</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => handleChange('firstName', e.target.value)}
                      placeholder="Ej: Juan"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Apellido del contacto</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => handleChange('lastName', e.target.value)}
                      placeholder="Ej: Pérez"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Cargo en la empresa</Label>
                  <Input
                    id="position"
                    value={formData.position}
                    onChange={(e) => handleChange('position', e.target.value)}
                    placeholder="Ej: Gerente de Mantenimiento"
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ====== CAMPOS PARA PERSONA ====== */}
        {!isCompany && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-purple-600" />
                <CardTitle className="text-lg">Datos Personales</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    Nombre <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => handleChange('firstName', e.target.value)}
                    placeholder="Ej: María"
                    className={errors.firstName ? 'border-red-500' : ''}
                  />
                  {errors.firstName && (
                    <p className="text-sm text-red-500">{errors.firstName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    Apellido <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => handleChange('lastName', e.target.value)}
                    placeholder="Ej: García"
                    className={errors.lastName ? 'border-red-500' : ''}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-red-500">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Teléfono <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="+54 11 5467 3062"
                      className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-sm text-red-500">{errors.phone}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="ejemplo@email.com"
                      className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-500">{errors.email}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuit">DNI / CUIL</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="cuit"
                    value={formData.cuit}
                    onChange={(e) => handleChange('cuit', e.target.value)}
                    placeholder="Ej: 20-12345678-9"
                    className={`pl-10 ${errors.cuit ? 'border-red-500' : ''}`}
                    aria-invalid={Boolean(errors.cuit)}
                  />
                </div>
                {errors.cuit && <p className="text-sm text-red-500">{errors.cuit}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value: 'active' | 'inactive' | 'prospect') => handleChange('status', value)}
                >
                  <SelectTrigger className="min-h-11 text-base sm:min-h-10 sm:text-sm">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">
                      <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                    </SelectItem>
                    <SelectItem value="inactive">
                      <Badge className="bg-gray-100 text-gray-700">Inactivo</Badge>
                    </SelectItem>
                    <SelectItem value="prospect">
                      <Badge className="bg-amber-100 text-amber-700">Cliente Potencial</Badge>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dirección (compartido) */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 w-5 h-5 text-blue-600" />
              <div>
                <CardTitle className="text-lg">Dirección principal de servicio</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Se copiará automáticamente al crear un turno para este cliente.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Calle, número, piso o unidad {formData.status === 'active' && <span className="text-red-500">*</span>}</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Ej: Av. Corrientes 1234, piso 3"
                className={errors.address ? 'border-red-500' : ''}
                aria-invalid={Boolean(errors.address)}
              />
              {errors.address && <p className="text-sm text-red-500">{errors.address}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Ciudad / Localidad</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Ej: Guernica"
                  className={errors.city ? 'border-red-500' : ''}
                  aria-invalid={Boolean(errors.city)}
                />
                {errors.city && <p className="text-sm text-red-500">{errors.city}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Provincia</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  placeholder="Ej: Buenos Aires"
                  className={errors.country ? 'border-red-500' : ''}
                  aria-invalid={Boolean(errors.country)}
                />
                {errors.country && <p className="text-sm text-red-500">{errors.country}</p>}
              </div>
            </div>

            <div className={`rounded-xl border p-3 ${hasCompleteAddress ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-start gap-2">
                {hasCompleteAddress ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${hasCompleteAddress ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {hasCompleteAddress ? 'Dirección lista para agendar' : hasStreetAddress ? 'Dirección incompleta' : 'Todavía no hay dirección de servicio'}
                  </p>
                  <p className={`mt-0.5 break-words text-xs ${hasCompleteAddress ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {fullAddress || 'Los clientes potenciales pueden guardarse sin dirección. Será necesaria cuando pasen a estado activo.'}
                  </p>
                </div>
                {hasCompleteAddress && (
                  <a
                    href={mapsUrl(fullAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 flex-shrink-0 touch-manipulation items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                  >
                    Mapa <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notas (compartido) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-lg">Notas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas adicionales</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Información adicional sobre el cliente..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex gap-2 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:relative lg:inset-auto lg:z-auto lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <Link className="flex-1 lg:flex-none" to={isEditing ? `/customers/${id}` : '/customers'}>
            <Button type="button" variant="outline" className="min-h-11 w-full touch-manipulation lg:w-auto">
              Cancelar
            </Button>
          </Link>
          <Button 
            type="submit" 
            className="min-h-11 flex-1 touch-manipulation bg-blue-600 hover:bg-blue-700 lg:flex-none"
            disabled={isSubmitting}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Cliente')}
          </Button>
        </div>
      </form>
    </div>
  );
}
