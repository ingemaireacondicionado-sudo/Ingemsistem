import { useState, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  User,
  Mail,
  Lock,
  Shield,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  EyeIcon,
  LayoutDashboard,
  Users,
  Truck,
  Package,
  CalendarDays,
  Wrench,
  StickyNote,
  DollarSign,
  Briefcase,
  UserCog,
  Settings,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/user';
import { ROLE_PERMISSIONS } from '@/types/user';

const ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrador', description: 'Acceso completo a todo el sistema' },
  { value: 'manager', label: 'Gerente', description: 'Gestión operativa sin acceso a usuarios' },
  { value: 'technician', label: 'Técnico', description: 'Acceso a agenda y trabajos asignados' },
  { value: 'viewer', label: 'Visualizador', description: 'Solo lectura - selecciona módulos específicos' },
];

// Módulos disponibles para asignar a visualizadores
const AVAILABLE_MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'suppliers', label: 'Proveedores', icon: Truck },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'calendar', label: 'Agenda', icon: CalendarDays },
  { id: 'technicians', label: 'Técnicos', icon: Wrench },
  { id: 'notes', label: 'Notas', icon: StickyNote },
  { id: 'finance', label: 'Finanzas', icon: DollarSign },
  { id: 'jobs', label: 'Trabajos', icon: Briefcase },
  { id: 'users', label: 'Usuarios', icon: UserCog },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

export function UserForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { users, addUser, updateUser, user: currentUser } = useAuth();
  const isEditing = !!id;

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'viewer' as UserRole,
    password: '',
    isActive: true,
    allowedModules: ['dashboard', 'customers'] as string[],
  });

  // Cargar datos si estamos editando
  useEffect(() => {
    if (isEditing && id) {
      const userToEdit = users.find((u) => u.id === id);
      if (userToEdit) {
        setFormData({
          name: userToEdit.name,
          email: userToEdit.email,
          role: userToEdit.role,
          password: '', // No mostrar contraseña actual
          isActive: userToEdit.isActive,
          allowedModules: userToEdit.allowedModules || ['dashboard', 'customers'],
        });
      }
    }
  }, [isEditing, id, users]);

  const isEditingSelf = Boolean(isEditing && currentUser && String(id) === String(currentUser.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validaciones
    if (!formData.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!formData.email.trim()) {
      setError('El email es obligatorio');
      return;
    }
    if (!isEditing && !formData.password) {
      setError('La contraseña es obligatoria para nuevos usuarios');
      return;
    }
    if (formData.password && formData.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (isEditingSelf && (formData.role !== currentUser?.role || !formData.isActive)) {
      setError('No podés cambiar tu propio rol ni desactivar tu cuenta');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && id) {
        const updateData = {
          ...formData,
          password: formData.password || undefined,
        };
        await updateUser(id, updateData);
        setSuccess('Usuario actualizado correctamente');
        setTimeout(() => navigate('/users'), 1500);
      } else {
        const result = await addUser(formData);
        if (result.success) {
          setSuccess('Usuario creado correctamente');
          setTimeout(() => navigate('/users'), 1500);
        } else {
          setError(result.error || 'Error al crear usuario');
        }
      }
    } catch {
      setError(isEditing ? 'No se pudo actualizar el usuario' : 'No se pudo crear el usuario');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRole = ROLE_PERMISSIONS[formData.role];

  // Función para alternar módulos permitidos
  const toggleModule = (moduleId: string) => {
    setFormData(prev => ({
      ...prev,
      allowedModules: prev.allowedModules.includes(moduleId)
        ? prev.allowedModules.filter(m => m !== moduleId)
        : [...prev.allowedModules, moduleId]
    }));
  };

  // Mantener la cantidad y el orden de hooks estables aun mientras carga la sesión.
  if (!currentUser || currentUser.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-24 sm:space-y-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" aria-label="Volver a usuarios" onClick={() => navigate('/users')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            {isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h1>
          <p className="text-slate-500">
            {isEditing ? 'Modifica los datos del usuario' : 'Crea un nuevo usuario para el sistema'}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-emerald-50 text-emerald-800 border-emerald-200">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6">
        {/* Formulario Principal */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-sky-600" />
                Información Básica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nombre */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nombre completo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Correo electrónico <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="ejemplo@ingem.com"
                    className="pl-10"
                    disabled={isEditing} // No permitir cambiar email al editar
                  />
                </div>
                {isEditing && (
                  <p className="text-xs text-slate-500">El email no se puede modificar</p>
                )}
              </div>

              {/* Contraseña */}
              <div className="space-y-2">
                <Label htmlFor="password">
                  Contraseña {!isEditing && <span className="text-red-500">*</span>}
                  {isEditing && <span className="text-slate-500">(dejar en blanco para no cambiar)</span>}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={isEditing ? '••••••••' : 'Ingresa una contraseña'}
                    className="pl-10 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rol */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-sky-600" />
                Rol y Permisos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLES.map((role) => (
                  <button
                    key={role.value}
                    type="button"
                    disabled={isEditingSelf}
                    onClick={() => setFormData({ ...formData, role: role.value })}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.role === role.value
                        ? 'border-sky-500 bg-sky-50'
                        : 'border-slate-200 hover:border-slate-300'
                    } ${isEditingSelf ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{role.label}</span>
                      {formData.role === role.value && (
                        <CheckCircle className="w-5 h-5 text-sky-600" />
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{role.description}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Módulos permitidos (solo para visualizadores) */}
          {formData.role === 'viewer' && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <EyeIcon className="w-5 h-5" />
                  Módulos Permitidos
                </CardTitle>
                <p className="text-sm text-amber-600">
                  Selecciona los módulos que este usuario podrá ver (solo lectura)
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {AVAILABLE_MODULES.map((module) => {
                    const Icon = module.icon;
                    const isSelected = formData.allowedModules.includes(module.id);
                    return (
                      <button
                        key={module.id}
                        type="button"
                        onClick={() => toggleModule(module.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-all ${
                          isSelected
                            ? 'border-amber-500 bg-amber-100'
                            : 'border-slate-200 bg-white hover:border-amber-300'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-amber-600' : 'text-slate-400'}`} />
                        <span className={`text-sm ${isSelected ? 'font-medium text-amber-800' : 'text-slate-600'}`}>
                          {module.label}
                        </span>
                        {isSelected && <CheckCircle className="w-4 h-4 text-amber-600 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-amber-600 mt-3">
                  <strong>Nota:</strong> Los usuarios visualizadores solo pueden ver información, no pueden crear, editar ni eliminar nada.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Estado */}
          <Card>
            <CardHeader>
              <CardTitle>Estado del Usuario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Usuario activo</p>
                  <p className="text-sm text-slate-500">
                    {formData.isActive
                      ? 'El usuario puede iniciar sesión'
                      : 'El usuario no podrá iniciar sesión'}
                  </p>
                </div>
                <Switch
                  checked={formData.isActive}
                  disabled={isEditingSelf}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Resumen de Permisos */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Permisos del Rol</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Badge className="mb-2">
                  {selectedRole.label}
                </Badge>
                <p className="text-sm text-slate-600">{selectedRole.description}</p>
              </div>

              {formData.role === 'viewer' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    <EyeIcon className="w-4 h-4 inline mr-1" />
                    Modo Solo Lectura
                  </p>
                  <p className="text-xs text-amber-600">
                    Este usuario solo podrá ver la información de los módulos seleccionados. No podrá crear, editar ni eliminar nada.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    {formData.role === 'viewer' ? 'Módulos permitidos:' : 'Módulos de acceso:'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {formData.role === 'viewer' ? (
                      formData.allowedModules.map((module) => (
                        <Badge key={module} variant="secondary" className="text-xs bg-amber-100 text-amber-700">
                          {getModuleLabel(module)}
                        </Badge>
                      ))
                    ) : (
                      selectedRole.modules.map((module) => (
                        <Badge key={module} variant="secondary" className="text-xs">
                          {getModuleLabel(module)}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <p className="text-sm font-medium text-slate-700 mb-2">Puede crear:</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedRole.canCreate.length > 0 ? (
                      selectedRole.canCreate.map((item) => (
                        <Badge key={item} variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                          {getEntityLabel(item)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-400">Sin permisos de creación</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <p className="text-sm font-medium text-slate-700 mb-2">Puede editar:</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedRole.canEdit.length > 0 ? (
                      selectedRole.canEdit.map((item) => (
                        <Badge key={item} variant="outline" className="text-xs text-blue-600 border-blue-200">
                          {getEntityLabel(item)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-400">Sin permisos de edición</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <p className="text-sm font-medium text-slate-700 mb-2">Puede eliminar:</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedRole.canDelete.length > 0 ? (
                      selectedRole.canDelete.map((item) => (
                        <Badge key={item} variant="outline" className="text-xs text-red-600 border-red-200">
                          {getEntityLabel(item)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-400">Sin permisos de eliminación</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botones de acción */}
          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={isSaving} className="w-full bg-sky-600 hover:bg-sky-700">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/users')}>
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Helper functions para traducir módulos y entidades
function getModuleLabel(module: string): string {
  const labels: Record<string, string> = {
    dashboard: 'Dashboard',
    customers: 'Clientes',
    suppliers: 'Proveedores',
    products: 'Productos',
    calendar: 'Agenda',
    technicians: 'Técnicos',
    notes: 'Notas',
    finance: 'Finanzas',
    jobs: 'Trabajos',
    users: 'Usuarios',
    settings: 'Configuración',
  };
  return labels[module] || module;
}

function getEntityLabel(entity: string): string {
  const labels: Record<string, string> = {
    customers: 'Clientes',
    suppliers: 'Proveedores',
    products: 'Productos',
    appointments: 'Turnos',
    technicians: 'Técnicos',
    notes: 'Notas',
    transactions: 'Transacciones',
    jobs: 'Trabajos',
    users: 'Usuarios',
  };
  return labels[entity] || entity;
}
