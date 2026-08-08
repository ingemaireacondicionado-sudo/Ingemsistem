import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Mail,
  Phone,
  Building2,
  MapPin,
  Tag,
  Calendar,
  FileText,
  User,
  Clock,
  FileDigit,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState } from 'react';
import type { Supplier } from '@/types/supplier';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/dateUtils';

interface SupplierDetailProps {
  suppliers: Supplier[];
  onDelete: (id: string) => void;
}

const statusLabels = {
  active: 'Activo',
  inactive: 'Inactivo',
};

const statusColors = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-700',
};

export function SupplierDetail({ suppliers, onDelete }: SupplierDetailProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEditEntity, canDeleteEntity } = useAuth();
  const canEditSuppliers = canEditEntity('suppliers');
  const canDeleteSuppliers = canDeleteEntity('suppliers');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const supplier = suppliers.find(s => s.id === id);

  if (!supplier) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/suppliers">
            <Button variant="ghost" size="icon" aria-label="Volver a proveedores">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Proveedor no encontrado</h1>
        </div>
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Proveedor no encontrado
            </h3>
            <p className="text-slate-500 mb-4">
              El proveedor que buscas no existe o ha sido eliminado
            </p>
            <Link to="/suppliers">
              <Button>Volver a la lista</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDelete = async () => {
    if (isDeleting) return;
    if (!canDeleteSuppliers) {
      toast.error('No tenés permiso para eliminar proveedores');
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(supplier.id);
      navigate('/suppliers');
    } catch (error) {
      console.error('Error al eliminar proveedor:', error);
      toast.error('No se pudo eliminar el proveedor. Probá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      label: 'Email',
      value: supplier.email,
      href: `mailto:${supplier.email}`,
    },
    {
      icon: Phone,
      label: 'Teléfono',
      value: supplier.phone,
      href: `tel:${supplier.phone}`,
    },
  ];

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/suppliers">
            <Button variant="ghost" size="icon" aria-label="Volver a proveedores">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
                {supplier.name}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={statusColors[supplier.status]}>
                {statusLabels[supplier.status]}
              </Badge>
              <span className="text-sm text-slate-500">
                Proveedor desde {parseLocalDate(supplier.createdAt).toLocaleDateString('es-AR')}
              </span>
            </div>
          </div>
        </div>
        {(canEditSuppliers || canDeleteSuppliers) && (
          <div className="flex items-center gap-2">
            {canEditSuppliers && (
              <Link to={`/suppliers/${supplier.id}/edit`}>
                <Button variant="outline" aria-label="Editar proveedor">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </Link>
            )}
            {canDeleteSuppliers && (
              <Button
                variant="destructive"
                aria-label="Eliminar proveedor"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile */}
        <div className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">
                {supplier.name}
              </h2>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-center gap-2">
                  <Tag className="w-4 h-4 text-slate-400" />
                  <p className="text-sm text-slate-500">{supplier.category}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="w-5 h-5 text-sky-600" />
                Información de Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contactInfo.map((item, index) => {
                const Icon = item.icon;
                return (
                  <a
                    key={index}
                    href={item.href}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                  >
                    <div className="w-10 h-10 bg-sky-50 rounded-lg flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                      <Icon className="w-5 h-5 text-sky-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-500">{item.label}</p>
                      <p className="font-medium text-slate-800 truncate">{item.value}</p>
                    </div>
                  </a>
                );
              })}
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-sky-600" />
                Ubicación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplier.address && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-500">Dirección</p>
                    <p className="font-medium text-slate-800">{supplier.address}</p>
                  </div>
                </div>
              )}
              {(supplier.city || supplier.province) && (
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-500">Ciudad / Provincia</p>
                    <p className="font-medium text-slate-800">
                      {supplier.city}{supplier.city && supplier.province ? ', ' : ''}{supplier.province}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Supplier Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileDigit className="w-5 h-5 text-sky-600" />
                Información del Proveedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-slate-500 mb-1">CUIT</p>
                  <div className="flex items-center gap-2">
                    <FileDigit className="w-4 h-4 text-slate-400" />
                    <p className="font-medium text-slate-800">{supplier.cuit}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1">Categoría</p>
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <p className="font-medium text-slate-800">{supplier.category}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1">Contacto</p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <p className="font-medium text-slate-800">{supplier.contactName}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1">Estado</p>
                  <Badge className={statusColors[supplier.status]}>
                    {statusLabels[supplier.status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1">Último contacto</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-slate-800">
                      {parseLocalDate(supplier.lastContact).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-600" />
                Historial
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6 space-y-6">
                <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200" />
                
                <div className="relative">
                  <div className="absolute -left-4 w-3 h-3 bg-sky-500 rounded-full border-2 border-white" />
                  <div>
                    <p className="font-medium text-slate-800">Último contacto</p>
                    <p className="text-sm text-slate-500">
                      {parseLocalDate(supplier.lastContact).toLocaleDateString('es-AR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                
                <div className="relative">
                  <div className="absolute -left-4 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                  <div>
                    <p className="font-medium text-slate-800">Proveedor registrado</p>
                    <p className="text-sm text-slate-500">
                      {parseLocalDate(supplier.createdAt).toLocaleDateString('es-AR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-600" />
                Notas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {supplier.notes ? (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-slate-700 whitespace-pre-wrap">{supplier.notes}</p>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No hay notas para este proveedor</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen && canDeleteSuppliers} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>¿Eliminar proveedor?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el proveedor
              <span className="font-semibold"> {supplier.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
