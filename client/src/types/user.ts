export type UserRole = 'admin' | 'manager' | 'technician' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
  isActive: boolean;
  allowedModules?: string[]; // Módulos específicos para visualizadores
  createdAt: string;
  updatedAt: string;
}

export interface UserFormData {
  name: string;
  email: string;
  role: UserRole;
  password?: string;
  isActive: boolean;
  allowedModules?: string[];
}

// Permisos por rol
export const ROLE_PERMISSIONS: Record<UserRole, {
  label: string;
  description: string;
  modules: string[];
  canCreate: string[];
  canEdit: string[];
  canDelete: string[];
}> = {
  admin: {
    label: 'Administrador',
    description: 'Acceso completo a todo el sistema',
    modules: ['dashboard', 'customers', 'suppliers', 'products', 'calendar', 'technicians', 'notes', 'finance', 'jobs', 'reports', 'users', 'settings'],
    canCreate: ['customers', 'suppliers', 'products', 'appointments', 'technicians', 'notes', 'transactions', 'jobs', 'users'],
    canEdit: ['customers', 'suppliers', 'products', 'appointments', 'technicians', 'notes', 'transactions', 'jobs', 'users'],
    canDelete: ['customers', 'suppliers', 'products', 'appointments', 'technicians', 'notes', 'transactions', 'jobs', 'users'],
  },
  manager: {
    label: 'Gerente',
    description: 'Gestión operativa sin acceso a configuración de usuarios',
    modules: ['dashboard', 'customers', 'suppliers', 'products', 'calendar', 'technicians', 'notes', 'finance', 'jobs', 'reports', 'settings'],
    canCreate: ['customers', 'suppliers', 'products', 'appointments', 'technicians', 'notes', 'transactions', 'jobs'],
    canEdit: ['customers', 'suppliers', 'products', 'appointments', 'technicians', 'notes', 'transactions', 'jobs'],
    canDelete: ['customers', 'suppliers', 'products', 'appointments', 'notes', 'transactions', 'jobs'],
  },
  technician: {
    label: 'Técnico',
    description: 'Acceso a agenda, trabajos asignados y notas',
    modules: ['dashboard', 'calendar', 'jobs', 'notes'],
    canCreate: ['notes'],
    canEdit: ['jobs'],
    canDelete: [],
  },
  viewer: {
    label: 'Visualizador',
    description: 'Solo lectura de información básica',
    modules: ['dashboard', 'customers', 'products', 'calendar'],
    canCreate: [],
    canEdit: [],
    canDelete: [],
  },
};

// Función para verificar si un usuario tiene acceso a un módulo
export function hasModuleAccess(role: UserRole, module: string): boolean {
  return ROLE_PERMISSIONS[role].modules.includes(module);
}

// Función para verificar si un usuario puede crear
export function canCreate(role: UserRole, entity: string): boolean {
  return ROLE_PERMISSIONS[role].canCreate.includes(entity);
}

// Función para verificar si un usuario puede editar
export function canEdit(role: UserRole, entity: string): boolean {
  return ROLE_PERMISSIONS[role].canEdit.includes(entity);
}

// Función para verificar si un usuario puede eliminar
export function canDelete(role: UserRole, entity: string): boolean {
  return ROLE_PERMISSIONS[role].canDelete.includes(entity);
}

// Usuarios iniciales
export const INITIAL_USERS: User[] = [
  {
    id: '1',
    name: 'Maxi',
    email: 'maxi@ingem.com',
    role: 'admin',
    password: 'maxi',
    isActive: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: '2',
    name: 'Ludmila',
    email: 'ludmila@ingem.com',
    role: 'manager',
    password: 'ludmila',
    isActive: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];
