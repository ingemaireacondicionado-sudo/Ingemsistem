import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  User as UserIcon,
  Shield,
  UserCheck,
  UserX,
  MoreVertical,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import type { User as UserType, UserRole } from '@/types/user';
import { ROLE_PERMISSIONS } from '@/types/user';

interface UsersListProps {
  users: UserType[];
  currentUser: UserType;
  onUpdate?: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  technician: 'bg-green-100 text-green-700',
  viewer: 'bg-slate-100 text-slate-700',
};

export function UsersList({ users, currentUser, onUpdate: _onUpdate, onDelete, onToggleStatus }: UsersListProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      searchTerm === '' ||
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleDelete = () => {
    if (currentUser.role === 'admin' && selectedUser && selectedUser.id !== currentUser.id) {
      onDelete(selectedUser.id);
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    }
  };

  if (currentUser.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Usuarios</h1>
          <p className="text-slate-500">{users.length} usuarios registrados</p>
        </div>
        <Button 
          className="bg-sky-600 hover:bg-sky-700"
          onClick={() => navigate('/users/new')}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Total</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Activos</p>
            <p className="text-2xl font-bold text-emerald-600">
              {users.filter(u => u.isActive).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Inactivos</p>
            <p className="text-2xl font-bold text-red-600">
              {users.filter(u => !u.isActive).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Administradores</p>
            <p className="text-2xl font-bold text-purple-600">
              {users.filter(u => u.role === 'admin').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar usuario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users List */}
      <Card>
        <CardContent className="p-0">
          {/* Vista móvil en tarjetas: evita una tabla horizontal difícil de usar */}
          <div className="space-y-3 p-3 sm:hidden">
            {filteredUsers.map((user) => (
              <div key={user.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 break-words">{user.name}</p>
                    <p className="text-sm text-slate-500 break-all">{user.email}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-11 w-11 flex-shrink-0 touch-manipulation" aria-label={`Acciones para ${user.name}`}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/users/${user.id}/edit`)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      {user.id !== currentUser.id && (
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => { setSelectedUser(user); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <Badge className={ROLE_COLORS[user.role]}>
                    <Shield className="w-3 h-3 mr-1" />
                    {ROLE_PERMISSIONS[user.role].label}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${user.isActive ? 'text-emerald-700' : 'text-red-700'}`}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                    {user.id !== currentUser.id && (
                      <Switch
                        checked={user.isActive}
                        onCheckedChange={() => onToggleStatus(user.id)}
                        aria-label={`${user.isActive ? 'Desactivar' : 'Activar'} a ${user.name}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">Usuario</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">Rol</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-500">Estado</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{user.name}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={ROLE_COLORS[user.role]}>
                        <Shield className="w-3 h-3 mr-1" />
                        {ROLE_PERMISSIONS[user.role].label}
                      </Badge>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        {ROLE_PERMISSIONS[user.role].description}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {user.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-700">
                            <UserCheck className="w-3 h-3 mr-1" />
                            Activo
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700">
                            <UserX className="w-3 h-3 mr-1" />
                            Inactivo
                          </Badge>
                        )}
                        {user.id !== currentUser.id && (
                          <Switch
                            checked={user.isActive}
                            onCheckedChange={() => onToggleStatus(user.id)}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Acciones de ${user.name}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/users/${user.id}/edit`)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          {user.id !== currentUser.id && (
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => { setSelectedUser(user); setDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-8 sm:py-12">
              <UserIcon className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600 mb-2">No se encontraron usuarios</h3>
              <p className="text-slate-500 mb-4">Intenta con otra búsqueda</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eliminar Usuario</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar al usuario <strong>{selectedUser?.name}</strong>?
              <br />
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
