import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Building2,
  Mail,
  Phone,
  MapPin,
  X,
  User,
  EyeIcon,
  Calendar,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Customer } from '@/types/customer';
import { useAuth } from '@/contexts/AuthContext';
import { normalize } from '@/lib/textUtils';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/dateUtils';
import { cleanPhone, mapsUrl, whatsappUrl } from '@/lib/contactUtils';

interface CustomersListProps {
  customers: Customer[];
  onDelete: (id: string) => void | Promise<void>;
}

const statusLabels = {
  active: 'Activo',
  inactive: 'Inactivo',
  prospect: 'Cliente Potencial',
};

const statusFilters = {
  all: 'Todos',
  active: 'Activos',
  inactive: 'Inactivos',
  prospect: 'Clientes Potenciales',
};

const customerTypeLabels = {
  company: 'Empresa',
  individual: 'Persona',
};

const customerTypeIcons = {
  company: Building2,
  individual: User,
};

function getCustomerDisplayName(customer: Customer): string {
  if (customer.customerType === 'company' && customer.company?.trim()) return customer.company.trim();
  return `${customer.firstName} ${customer.lastName}`.trim() || 'Cliente sin nombre';
}

function getCustomerFullAddress(customer: Customer): string {
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

function hasCompleteCustomerAddress(customer: Customer): boolean {
  return Boolean(customer.address?.trim() && customer.city?.trim() && customer.country?.trim());
}

export function CustomersList({ customers, onDelete }: CustomersListProps) {
  const { userRole, canCreateEntity, canEditEntity, canDeleteEntity } = useAuth();
  const isViewer = userRole === 'viewer';
  const canCreateAppointments = canCreateEntity('appointments');
  const canEditCustomers = canEditEntity('customers');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [addressFilter, setAddressFilter] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeCount = customers.filter(customer => customer.status === 'active').length;
  const prospectCount = customers.filter(customer => customer.status === 'prospect').length;
  const missingAddressCount = customers.filter(customer => !hasCompleteCustomerAddress(customer)).length;

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = normalize(searchQuery);
    const statusOrder: Record<string, number> = { active: 0, prospect: 1, inactive: 2 };

    return customers.filter((customer) => {
      const searchableText = normalize([
        getCustomerDisplayName(customer),
        customer.firstName,
        customer.lastName,
        customer.email,
        customer.company,
        customer.phone,
        cleanPhone(customer.phone || ''),
        customer.cuit,
        (customer.cuit || '').replace(/\D/g, ''),
        customer.address,
        customer.city,
        customer.country,
      ].filter(Boolean).join(' '));
      const matchesSearch = !normalizedQuery || searchableText.includes(normalizedQuery);
      const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;
      const matchesType = typeFilter === 'all' || customer.customerType === typeFilter;
      const hasCompleteAddress = hasCompleteCustomerAddress(customer);
      const matchesAddress = addressFilter === 'all' ||
        (addressFilter === 'complete' && hasCompleteAddress) ||
        (addressFilter === 'missing' && !hasCompleteAddress);

      return matchesSearch && matchesStatus && matchesType && matchesAddress;
    }).sort((firstCustomer, secondCustomer) =>
      (statusOrder[firstCustomer.status] ?? 9) - (statusOrder[secondCustomer.status] ?? 9) ||
      getCustomerDisplayName(firstCustomer).localeCompare(getCustomerDisplayName(secondCustomer), 'es-AR')
    );
  }, [customers, searchQuery, statusFilter, typeFilter, addressFilter]);

  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete || isDeleting) return;
    if (!canDeleteEntity('customers')) {
      toast.error('No tenés permiso para eliminar clientes');
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(customerToDelete.id);
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    } catch (err) {
      console.error('Error al eliminar cliente:', err);
      toast.error('No se pudo eliminar el cliente. Probá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            Clientes
            {isViewer && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                <EyeIcon className="w-3 h-3 mr-1" />
                Solo lectura
              </Badge>
            )}
          </h1>
          <p className="text-xs sm:text-base text-gray-500 mt-0.5">
            {filteredCustomers.length === customers.length
              ? `${customers.length} ${customers.length === 1 ? 'cliente' : 'clientes'}`
              : `${filteredCustomers.length} de ${customers.length} clientes`}
          </p>
        </div>
        {!isViewer && canCreateEntity('customers') && (
          <Link to="/customers/new">
            <Button className="bg-blue-600 hover:bg-blue-700 h-11 sm:h-10 text-sm px-3 sm:px-4 touch-manipulation">
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Nuevo Cliente</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Resumen operativo */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <button
          type="button"
          className="text-left"
          onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all'); setAddressFilter('all'); }}
        >
          <Card className={`h-full min-h-0 gap-0 py-0 transition-all hover:shadow-md ${!searchQuery && statusFilter === 'all' && typeFilter === 'all' && addressFilter === 'all' ? 'ring-2 ring-sky-400' : ''}`}>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-xl font-bold text-slate-900 sm:text-2xl">{customers.length}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => { setSearchQuery(''); setStatusFilter('active'); setTypeFilter('all'); setAddressFilter('all'); }}
        >
          <Card className={`h-full min-h-0 gap-0 py-0 transition-all hover:shadow-md ${!searchQuery && statusFilter === 'active' && typeFilter === 'all' && addressFilter === 'all' ? 'ring-2 ring-emerald-400' : ''}`}>
            <CardContent className="p-3 sm:p-4">
              <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Activos</p>
              <p className="text-xl font-bold text-emerald-700 sm:text-2xl">{activeCount}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => { setSearchQuery(''); setStatusFilter('prospect'); setTypeFilter('all'); setAddressFilter('all'); }}
        >
          <Card className={`h-full min-h-0 gap-0 py-0 transition-all hover:shadow-md ${!searchQuery && statusFilter === 'prospect' && typeFilter === 'all' && addressFilter === 'all' ? 'ring-2 ring-amber-400' : ''}`}>
            <CardContent className="p-3 sm:p-4">
              <p className="flex items-center gap-1 text-xs text-amber-700"><Building2 className="h-3.5 w-3.5" /> Potenciales</p>
              <p className="text-xl font-bold text-amber-700 sm:text-2xl">{prospectCount}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all'); setAddressFilter('missing'); }}
        >
          <Card className={`h-full min-h-0 gap-0 py-0 transition-all hover:shadow-md ${!searchQuery && statusFilter === 'all' && typeFilter === 'all' && addressFilter === 'missing' ? 'ring-2 ring-red-400' : ''}`}>
            <CardContent className="p-3 sm:p-4">
              <p className="flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Sin dirección</p>
              <p className="text-xl font-bold text-red-700 sm:text-2xl">{missingAddressCount}</p>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-2.5 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
              <Input
                aria-label="Buscar clientes"
                placeholder="Nombre, empresa, CUIT, teléfono o dirección..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 sm:pl-10 h-11 sm:h-10 text-base sm:text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 inline-flex items-center justify-center touch-manipulation"
                >
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <Filter className="w-4 h-4 text-gray-400 hidden sm:block" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 w-full text-base sm:h-10 sm:w-[150px] sm:text-sm">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusFilters).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-11 w-full text-base sm:h-10 sm:w-[140px] sm:text-sm">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="company">Empresa</SelectItem>
                  <SelectItem value="individual">Persona</SelectItem>
                </SelectContent>
              </Select>
              <Select value={addressFilter} onValueChange={setAddressFilter}>
                <SelectTrigger className="col-span-2 h-11 w-full text-base sm:h-10 sm:w-[170px] sm:text-sm">
                  <SelectValue placeholder="Dirección" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las direcciones</SelectItem>
                  <SelectItem value="complete">Dirección completa</SelectItem>
                  <SelectItem value="missing">Dirección incompleta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers Grid */}
      {filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No se encontraron clientes
            </h3>
            <p className="text-gray-500 mb-4">
              Intenta ajustar los filtros o busca con otros términos
            </p>
            <Button variant="outline" onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all'); setAddressFilter('all'); }}>
              Limpiar filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-4">
          {filteredCustomers.map((customer) => {
            const TypeIcon = customerTypeIcons[customer.customerType] ?? User;
            const displayName = getCustomerDisplayName(customer);
            const contactName = `${customer.firstName} ${customer.lastName}`.trim();
            const fullAddress = getCustomerFullAddress(customer);
            const hasCompleteAddress = hasCompleteCustomerAddress(customer);
            const initials = displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
            return (
              <Card key={customer.id} className="hover:shadow-lg transition-shadow group">
                <CardContent className="p-3 sm:p-5">
                  <div className="flex items-start justify-between mb-2.5 sm:mb-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <Avatar className="w-9 h-9 sm:w-12 sm:h-12 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white text-xs sm:text-base">
                          {initials || 'CL'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link to={`/customers/${customer.id}`} className="block truncate text-sm font-semibold text-gray-900 hover:text-sky-700 sm:text-base">
                          {displayName}
                        </Link>
                        <p className="truncate text-xs text-gray-500 sm:text-sm">
                          {customer.customerType === 'company' && contactName && contactName !== displayName
                            ? `${contactName}${customer.position ? ` · ${customer.position}` : ''}`
                            : customer.position || customerTypeLabels[customer.customerType]}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8 touch-manipulation" aria-label={`Acciones de ${customer.firstName} ${customer.lastName}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Link to={`/customers/${customer.id}`}>
                          <DropdownMenuItem>
                            <Eye className="w-4 h-4 mr-2" />
                            Ver detalles
                          </DropdownMenuItem>
                        </Link>
                        {!isViewer && canEditEntity('customers') && (
                          <Link to={`/customers/${customer.id}/edit`}>
                            <DropdownMenuItem>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          </Link>
                        )}
                        {!isViewer && canDeleteEntity('customers') && (
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDeleteClick(customer)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mb-2.5 space-y-1.5 sm:mb-4 sm:space-y-2">
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} className="flex min-h-8 items-center gap-1.5 text-xs text-gray-600 hover:text-sky-700 sm:gap-2 sm:text-sm">
                        <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </a>
                    )}
                    {customer.phone && (
                      <a href={`tel:${cleanPhone(customer.phone)}`} className="flex min-h-8 items-center gap-1.5 text-xs text-gray-600 hover:text-sky-700 sm:gap-2 sm:text-sm">
                        <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{customer.phone}</span>
                      </a>
                    )}
                    {hasCompleteAddress ? (
                      <a
                        href={mapsUrl(fullAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-8 items-start gap-1.5 text-xs text-gray-600 hover:text-sky-700 sm:gap-2 sm:text-sm"
                      >
                        <MapPin className="mt-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span className="line-clamp-2 break-words">{fullAddress}</span>
                      </a>
                    ) : (
                      <div className="flex min-h-8 items-center gap-1.5 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-700 sm:gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Falta completar la dirección</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2.5 sm:pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                      <Badge 
                        variant="secondary"
                        className={`text-xs ${
                          customer.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          customer.status === 'inactive' ? 'bg-gray-100 text-gray-700' :
                          'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {statusLabels[customer.status]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <TypeIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                        {customerTypeLabels[customer.customerType]}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-400">
                      {parseLocalDate(customer.createdAt).toLocaleDateString('es-AR')}
                    </span>
                  </div>

                  {(customer.phone || canCreateAppointments || (!hasCompleteAddress && canEditCustomers)) && (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                      {customer.phone && (
                        <a
                          href={whatsappUrl(customer.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-700 hover:bg-green-100"
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp
                        </a>
                      )}
                      {hasCompleteAddress && canCreateAppointments && (
                        <Link
                          to={`/calendar/new?clientId=${customer.id}`}
                          className={`${customer.phone ? '' : 'col-span-2'} inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700`}
                        >
                          <Calendar className="h-4 w-4" />
                          Agendar
                        </Link>
                      )}
                      {!hasCompleteAddress && canEditCustomers && (
                        <Link
                          to={`/customers/${customer.id}/edit`}
                          className={`${customer.phone ? '' : 'col-span-2'} inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100`}
                        >
                          <MapPin className="h-4 w-4" />
                          Completar dirección
                        </Link>
                      )}
                      {!hasCompleteAddress && !canEditCustomers && canCreateAppointments && (
                        <Link
                          to={`/calendar/new?clientId=${customer.id}`}
                          className={`${customer.phone ? '' : 'col-span-2'} inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700`}
                        >
                          <Calendar className="h-4 w-4" />
                          Agendar
                        </Link>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>¿Eliminar cliente?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Esta acción no se puede deshacer. Se eliminará permanentemente el cliente
                  {customerToDelete && (
                    <span className="font-semibold"> {getCustomerDisplayName(customerToDelete)}</span>
                  )}.
                </p>
                <p className="text-amber-600 text-sm font-medium">
                  ⚠️ Los trabajos y turnos asociados a este cliente no se eliminarán, pero quedarán sin cliente asignado.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={isDeleting || !canDeleteEntity('customers')}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
