
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  User,
  Phone,
  Mail,
  FileCheck,
  AlertTriangle,
  Shield,
  FileText,
  MoreVertical,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import type { Technician } from '@/types/technician';
import { TECHNICIAN_SPECIALTIES, getTechnicianStatus, checkTechnicianDocumentation } from '@/types/technician';
import { normalize } from '@/lib/textUtils';
import { useAuth } from '@/contexts/AuthContext';

interface TechniciansListProps {
  technicians: Technician[];
  onDelete: (id: string) => void;
}

export function TechniciansList({ technicians, onDelete }: TechniciansListProps) {
  const navigate = useNavigate();
  const { userRole, canCreateEntity, canEditEntity, canDeleteEntity } = useAuth();
  const isViewer = userRole === 'viewer';
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const filteredTechnicians = technicians.filter((tech) => {
    const matchesSearch =
      searchTerm === '' ||
      normalize(`${tech.firstName} ${tech.lastName}`).includes(normalize(searchTerm)) ||
      normalize(tech.email).includes(normalize(searchTerm)) ||
      tech.dni.includes(searchTerm);

    const matchesSpecialty = filterSpecialty === 'all' || tech.specialty === filterSpecialty;
    
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && tech.isActive) ||
      (filterStatus === 'inactive' && !tech.isActive);

    return matchesSearch && matchesSpecialty && matchesStatus;
  });

  const activeCount = technicians.filter(t => t.isActive).length;
  const inactiveCount = technicians.filter(t => !t.isActive).length;

  const handleDelete = () => {
    if (selectedTechnician && !isViewer && canDeleteEntity('technicians')) {
      onDelete(selectedTechnician.id);
      setDeleteDialogOpen(false);
      setSelectedTechnician(null);
    }
  };

  const getSpecialtyLabel = (value: string) => {
    return TECHNICIAN_SPECIALTIES.find(s => s.value === value)?.label || value;
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            Técnicos
            {isViewer && <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Solo lectura</Badge>}
          </h1>
          <p className="text-slate-500">
            {activeCount} activos · {inactiveCount} inactivos
          </p>
        </div>
        {!isViewer && canCreateEntity('technicians') && <Button
          className="bg-sky-600 hover:bg-sky-700"
          onClick={() => navigate('/technicians/new')}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Técnico
        </Button>}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Total Técnicos</p>
            <p className="text-2xl font-bold">{technicians.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Activos</p>
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Doc. Completa</p>
            <p className="text-2xl font-bold text-blue-600">
              {technicians.filter(t => {
                if (!t.isActive) return false;
                const doc = checkTechnicianDocumentation(t);
                return doc.isValid;
              }).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Falta Doc.</p>
            <p className="text-2xl font-bold text-amber-600">
              {technicians.filter(t => {
                if (!t.isActive) return false;
                const doc = checkTechnicianDocumentation(t);
                return !doc.isValid;
              }).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar técnico..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={filterSpecialty}
              onChange={(e) => setFilterSpecialty(e.target.value)}
              className="w-full min-h-11 px-3 py-2 border rounded-lg text-base sm:text-sm bg-white"
          >
            <option value="all">Todas las especialidades</option>
            {TECHNICIAN_SPECIALTIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full min-h-11 px-3 py-2 border rounded-lg text-base sm:text-sm bg-white"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Technicians List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredTechnicians.map((tech) => {
          const status = getTechnicianStatus(tech);
          const docStatus = checkTechnicianDocumentation(tech);
          
          return (
            <Card 
              key={tech.id} 
              className={`hover:shadow-md transition-shadow ${!tech.isActive ? 'opacity-60' : ''}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                      {tech.firstName[0]}{tech.lastName[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        {tech.firstName} {tech.lastName}
                      </h3>
                      <p className="text-sm text-slate-500">{getSpecialtyLabel(tech.specialty)}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Acciones de ${tech.firstName} ${tech.lastName}`}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setSelectedTechnician(tech); setDetailDialogOpen(true); }}>
                        <User className="w-4 h-4 mr-2" />
                        Ver detalles
                      </DropdownMenuItem>
                      {!isViewer && canEditEntity('technicians') && <DropdownMenuItem onClick={() => navigate(`/technicians/${tech.id}/edit`)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>}
                      {!isViewer && canDeleteEntity('technicians') && <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => { setSelectedTechnician(tech); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Contact Info */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {tech.phone}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail className="w-4 h-4 text-slate-400" />
                    {tech.email}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="w-4 h-4 text-slate-400" />
                    DNI: {tech.dni}
                  </div>
                </div>

                {/* Documentation Status */}
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-medium text-slate-500 uppercase">Documentación</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge 
                      variant={tech.hasInsurance ? 'default' : 'destructive'}
                      className={`text-xs ${tech.hasInsurance ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      Seguro
                    </Badge>
                    <Badge 
                      variant={tech.hasCriminalRecord ? 'default' : 'destructive'}
                      className={`text-xs ${tech.hasCriminalRecord ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}
                    >
                      <FileCheck className="w-3 h-3 mr-1" />
                      Antecedentes
                    </Badge>
                    <Badge 
                      variant={tech.hasPlatformDocuments ? 'default' : 'destructive'}
                      className={`text-xs ${tech.hasPlatformDocuments ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      Plataforma
                    </Badge>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <Badge className={`${status.bgColor} ${status.color} border-0`}>
                    {status.label}
                  </Badge>
                  {docStatus.warnings.length > 0 && (
                    <div className="flex items-center gap-1 text-amber-600 text-xs">
                      <AlertTriangle className="w-3 h-3" />
                      Próx. a vencer
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTechnicians.length === 0 && (
        <div className="text-center py-8 sm:py-12">
          <User className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">No se encontraron técnicos</h3>
          <p className="text-slate-500 mb-4">Intenta con otra búsqueda o agrega un nuevo técnico</p>
          {!isViewer && canCreateEntity('technicians') && <Button onClick={() => navigate('/technicians/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Técnico
          </Button>}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Detalles del Técnico</DialogTitle>
          </DialogHeader>
          {selectedTechnician && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xl font-semibold">
                  {selectedTechnician.firstName[0]}{selectedTechnician.lastName[0]}
                </div>
                <div>
                  <h3 className="text-xl font-semibold">
                    {selectedTechnician.firstName} {selectedTechnician.lastName}
                  </h3>
                  <p className="text-slate-500">{getSpecialtyLabel(selectedTechnician.specialty)}</p>
                  <Badge className={`mt-1 ${getTechnicianStatus(selectedTechnician).bgColor} ${getTechnicianStatus(selectedTechnician).color}`}>
                    {getTechnicianStatus(selectedTechnician).label}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Teléfono</p>
                  <p className="font-medium">{selectedTechnician.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-medium">{selectedTechnician.email}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">DNI</p>
                  <p className="font-medium">{selectedTechnician.dni}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Estado</p>
                  <p className="font-medium">{selectedTechnician.isActive ? 'Activo' : 'Inactivo'}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500 mb-2">Documentación</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Seguro de Responsabilidad Civil
                    </span>
                    {selectedTechnician.hasInsurance ? (
                      <div className="text-right">
                        <Badge className="bg-emerald-100 text-emerald-700">OK</Badge>
                        {selectedTechnician.insuranceExpiryDate && (
                          <p className="text-xs text-slate-500">Vence: {selectedTechnician.insuranceExpiryDate}</p>
                        )}
                      </div>
                    ) : (
                      <Badge variant="destructive">Falta</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4" />
                      Antecedentes Penales
                    </span>
                    {selectedTechnician.hasCriminalRecord ? (
                      <div className="text-right">
                        <Badge className="bg-emerald-100 text-emerald-700">OK</Badge>
                        {selectedTechnician.criminalRecordExpiryDate && (
                          <p className="text-xs text-slate-500">Vence: {selectedTechnician.criminalRecordExpiryDate}</p>
                        )}
                      </div>
                    ) : (
                      <Badge variant="destructive">Falta</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Documentación en Plataforma
                    </span>
                    {selectedTechnician.hasPlatformDocuments ? (
                      <Badge className="bg-emerald-100 text-emerald-700">OK</Badge>
                    ) : (
                      <Badge variant="destructive">Falta</Badge>
                    )}
                  </div>
                </div>
              </div>

              {selectedTechnician.notes && (
                <div>
                  <p className="text-sm text-slate-500">Notas</p>
                  <p className="text-sm">{selectedTechnician.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eliminar Técnico</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar a <strong>{selectedTechnician?.firstName} {selectedTechnician?.lastName}</strong>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
