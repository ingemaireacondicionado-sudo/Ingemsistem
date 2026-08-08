import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  User,
  FileDigit,
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
import type { Supplier, SupplierFormData } from '@/types/supplier';
import { useAuth } from '@/contexts/AuthContext';

interface SupplierFormProps {
  suppliers: Supplier[];
  categories: string[];
  onSave: (data: SupplierFormData) => string | Promise<string>;
  onUpdate: (id: string, data: SupplierFormData) => void | Promise<void>;
}

const emptyFormData: SupplierFormData = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  cuit: '',
  category: '',
  status: 'active',
  address: '',
  city: '',
  province: '',
  notes: '',
};

const provinces = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];

export function SupplierForm({ suppliers, categories, onSave, onUpdate }: SupplierFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { canCreateEntity, canEditEntity } = useAuth();
  const canManageSupplier = isEditing
    ? canEditEntity('suppliers')
    : canCreateEntity('suppliers');

  const [formData, setFormData] = useState<SupplierFormData>(emptyFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof SupplierFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isEditing && id) {
      const supplier = suppliers.find(s => s.id === id);
      if (supplier) {
        setFormData({
          name: supplier.name,
          contactName: supplier.contactName,
          email: supplier.email,
          phone: supplier.phone,
          cuit: supplier.cuit,
          category: supplier.category,
          status: supplier.status,
          address: supplier.address,
          city: supplier.city,
          province: supplier.province,
          notes: supplier.notes,
        });
      } else {
        navigate('/suppliers');
      }
    }
  }, [id, suppliers, isEditing, navigate]);

  const validateCUIT = (cuit: string): boolean => {
    // Validación básica de formato CUIT argentino (XX-XXXXXXXX-X)
    const cuitRegex = /^\d{2}-?\d{8}-?\d$/;
    return cuitRegex.test(cuit);
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof SupplierFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre del proveedor es obligatorio';
    }
    if (!formData.contactName.trim()) {
      newErrors.contactName = 'El nombre del contacto es obligatorio';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'El email es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'El email no es válido';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'El teléfono es obligatorio';
    }
    if (!formData.cuit.trim()) {
      newErrors.cuit = 'El CUIT es obligatorio';
    } else if (!validateCUIT(formData.cuit)) {
      newErrors.cuit = 'El formato del CUIT no es válido (XX-XXXXXXXX-X)';
    }
    if (!formData.category) {
      newErrors.category = 'La categoría es obligatoria';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (isEditing && id) {
        await onUpdate(id, formData);
        navigate(`/suppliers/${id}`);
      } else {
        const newId = await onSave(formData);
        navigate(`/suppliers/${newId}`);
      }
    } catch {
      setErrors(prev => ({ ...prev, companyName: 'Error al guardar. Revisá la conexión y probá de nuevo.' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof SupplierFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const formatCUIT = (value: string) => {
    // Formatea el CUIT mientras escribe
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 10) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}-${numbers.slice(2, 10)}-${numbers.slice(10, 11)}`;
  };

  if (!canManageSupplier) {
    return <Navigate to="/suppliers" replace />;
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-24 sm:space-y-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={isEditing ? `/suppliers/${id}` : '/suppliers'}>
          <Button variant="ghost" size="icon" aria-label="Volver a proveedores">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
            {isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h1>
          <p className="text-slate-500 mt-1">
            {isEditing ? 'Actualiza la información del proveedor' : 'Completa los datos del nuevo proveedor'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Información del Proveedor */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-sky-600" />
              <CardTitle className="text-lg">Información del Proveedor</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Razón Social / Nombre <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Ej: Frio Industrial Argentina S.A."
                  className={`pl-10 ${errors.name ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cuit">
                  CUIT <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <FileDigit className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="cuit"
                    value={formData.cuit}
                    onChange={(e) => handleChange('cuit', formatCUIT(e.target.value))}
                    placeholder="30-12345678-9"
                    maxLength={13}
                    className={`pl-10 ${errors.cuit ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.cuit && (
                  <p className="text-sm text-red-500">{errors.cuit}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">
                  Categoría <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => handleChange('category', value)}
                >
                  <SelectTrigger className={errors.category ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-sm text-red-500">{errors.category}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: 'active' | 'inactive') => handleChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                  </SelectItem>
                  <SelectItem value="inactive">
                    <Badge className="bg-gray-100 text-gray-700">Inactivo</Badge>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Información de Contacto */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-sky-600" />
              <CardTitle className="text-lg">Información de Contacto</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">
                Nombre del Contacto <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="contactName"
                  value={formData.contactName}
                  onChange={(e) => handleChange('contactName', e.target.value)}
                  placeholder="Ej: Roberto Fernández"
                  className={`pl-10 ${errors.contactName ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.contactName && (
                <p className="text-sm text-red-500">{errors.contactName}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="ejemplo@proveedor.com.ar"
                    className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">
                  Teléfono <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    placeholder="+54 11 4567-8901"
                    className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-sm text-red-500">{errors.phone}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ubicación */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sky-600" />
              <CardTitle className="text-lg">Ubicación</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Calle, número, piso..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Ej: CABA"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Provincia</Label>
                <Select 
                  value={formData.province} 
                  onValueChange={(value) => handleChange('province', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una provincia" />
                  </SelectTrigger>
                  <SelectContent>
                    {provinces.map((province) => (
                      <SelectItem key={province} value={province}>
                        {province}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notas */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-600" />
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
                placeholder="Información adicional sobre el proveedor..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Link to={isEditing ? `/suppliers/${id}` : '/suppliers'}>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </Link>
          <Button 
            type="submit" 
            className="bg-sky-600 hover:bg-sky-700"
            disabled={isSubmitting}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Proveedor')}
          </Button>
        </div>
      </form>
    </div>
  );
}
