import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { UserRole, UserFormData } from '@/types/user';
import { hasModuleAccess, canCreate, canEdit, canDelete } from '@/types/user';
import { trpc } from '@/lib/trpc';

// Simplified User type for auth context (no password exposed to frontend)
interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  allowedModules?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  users: AuthUser[];
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  isAuthenticated: boolean;
  userRole: UserRole | null;
  hasAccess: (module: string) => boolean;
  canCreateEntity: (entity: string) => boolean;
  canEditEntity: (entity: string) => boolean;
  canDeleteEntity: (entity: string) => boolean;
  addUser: (data: UserFormData) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, data: UserFormData) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  toggleUserStatus: (id: string) => Promise<void>;
  refetchUsers: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('ingem_current_user_v2');
    return saved ? JSON.parse(saved) : null;
  });

  // Only fetch users when authenticated (security: don't expose user list before login)
  const usersQuery = trpc.ingemAuth.getUsers.useQuery(undefined, {
    staleTime: 30000,
    enabled: !!user,
  });
  const loginMutation = trpc.ingemAuth.login.useMutation();
  const createUserMutation = trpc.ingemAuth.createUser.useMutation();
  const updateUserMutation = trpc.ingemAuth.updateUser.useMutation();
  const deleteUserMutation = trpc.ingemAuth.deleteUser.useMutation();

  const users: AuthUser[] = (usersQuery.data ?? []).map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRole,
    isActive: u.isActive,
    allowedModules: u.allowedModules,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));

  useEffect(() => {
    if (user) {
      localStorage.setItem('ingem_current_user_v2', JSON.stringify(user));
    } else {
      localStorage.removeItem('ingem_current_user_v2');
    }
  }, [user]);

  // Sync logged-in user data with server data whenever users list loads
  useEffect(() => {
    if (user && users.length > 0) {
      const serverUser = users.find(u => u.id === user.id || u.email === user.email);
      if (serverUser) {
        const needsUpdate = 
          serverUser.name !== user.name ||
          serverUser.email !== user.email ||
          serverUser.role !== user.role ||
          serverUser.isActive !== user.isActive;
        if (needsUpdate) {
          setUser(prev => prev ? {
            ...prev,
            name: serverUser.name,
            email: serverUser.email,
            role: serverUser.role,
            isActive: serverUser.isActive,
            allowedModules: serverUser.allowedModules,
          } : null);
        }
      }
    }
  }, [users]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await loginMutation.mutateAsync({ email, password });
      if (result.success && 'user' in result && result.user) {
        // Store JWT token for authenticated API requests
        if ('token' in result && result.token) {
          localStorage.setItem('ingem_auth_token', result.token as string);
        }
        setUser(result.user as AuthUser);
        return { success: true };
      }
      return { success: false, error: ('error' in result ? result.error : undefined) || 'Credenciales inválidas' };
    } catch (e: any) {
      return { success: false, error: 'Error de conexión' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ingem_auth_token');
  };

  const updatePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario logueado' };
    try {
      // Verify current password via login (also refreshes token)
      const check = await loginMutation.mutateAsync({ email: user.email, password: currentPassword });
      if (!check.success) return { success: false, error: 'Contraseña actual incorrecta' };
      // Store refreshed token from re-login
      if ('token' in check && check.token) {
        localStorage.setItem('ingem_auth_token', check.token as string);
      }
      await updateUserMutation.mutateAsync({ id: parseInt(user.id), password: newPassword });
      usersQuery.refetch();
      return { success: true };
    } catch {
      return { success: false, error: 'Error al actualizar contraseña' };
    }
  };

  const hasAccess = useCallback((module: string): boolean => {
    if (!user) return false;
    if (user.role === 'viewer' && user.allowedModules && user.allowedModules.length > 0) {
      return user.allowedModules.includes(module);
    }
    return hasModuleAccess(user.role, module);
  }, [user]);

  const canCreateEntity = useCallback((entity: string): boolean => {
    if (!user) return false;
    return canCreate(user.role, entity);
  }, [user]);

  const canEditEntity = useCallback((entity: string): boolean => {
    if (!user) return false;
    return canEdit(user.role, entity);
  }, [user]);

  const canDeleteEntity = useCallback((entity: string): boolean => {
    if (!user) return false;
    return canDelete(user.role, entity);
  }, [user]);

  const addUser = async (data: UserFormData): Promise<{ success: boolean; error?: string }> => {
    if (!user || user.role !== 'admin') {
      return { success: false, error: 'No tienes permisos para crear usuarios' };
    }
    if (users.some(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      return { success: false, error: 'Ya existe un usuario con ese email' };
    }
    if (!data.password) {
      return { success: false, error: 'La contraseña es obligatoria' };
    }
    try {
      await createUserMutation.mutateAsync({
        name: data.name,
        email: data.email,
        password: data.password!,
        role: data.role,
        isActive: data.isActive,
        allowedModules: data.allowedModules,
      });
      usersQuery.refetch();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'Error al crear usuario' };
    }
  };

  const updateUser = async (id: string, data: UserFormData) => {
    if (!user || user.role !== 'admin') return;
    try {
      await updateUserMutation.mutateAsync({
        id: parseInt(id),
        name: data.name,
        email: data.email,
        password: data.password || undefined,
        role: data.role,
        isActive: data.isActive,
        allowedModules: data.allowedModules,
      });
      usersQuery.refetch();
    } catch (e) {
      console.error('Error updating user:', e);
    }
  };

  const deleteUser = async (id: string) => {
    if (!user || user.role !== 'admin') return;
    if (id === user.id) return;
    try {
      await deleteUserMutation.mutateAsync({ id: parseInt(id) });
      usersQuery.refetch();
    } catch (e) {
      console.error('Error deleting user:', e);
    }
  };

  const toggleUserStatus = async (id: string) => {
    if (!user || user.role !== 'admin') return;
    if (id === user.id) return;
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;
    try {
      await updateUserMutation.mutateAsync({ id: parseInt(id), isActive: !targetUser.isActive });
      usersQuery.refetch();
    } catch (e) {
      console.error('Error toggling user status:', e);
    }
  };

  const refetchUsers = () => {
    usersQuery.refetch();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        login,
        logout,
        updatePassword,
        isAuthenticated: !!user,
        userRole: user?.role || null,
        hasAccess,
        canCreateEntity,
        canEditEntity,
        canDeleteEntity,
        addUser,
        updateUser,
        deleteUser,
        toggleUserStatus,
        refetchUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
