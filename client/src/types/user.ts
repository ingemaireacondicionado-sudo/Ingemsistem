// Los permisos por rol viven en una fuente única compartida con el backend.
// Este módulo re-exporta esa fuente y conserva los tipos de usuario del frontend.
export type { UserRole } from '@shared/permissions';
export {
  ROLE_PERMISSIONS,
  hasModuleAccess,
  canAccessModule,
  canCreate,
  canEdit,
  canDelete,
} from '@shared/permissions';

import type { UserRole } from '@shared/permissions';

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
