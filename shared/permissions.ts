// Fuente única de verdad de permisos por rol, compartida entre frontend y
// backend. Replica EXACTAMENTE el comportamiento que ya espera la interfaz;
// no agrega permisos nuevos.

export type UserRole = "admin" | "manager" | "technician" | "viewer";

// Entidades sobre las que se controlan create/edit/delete.
export type PermissionEntity =
  | "customers" | "suppliers" | "products" | "appointments"
  | "technicians" | "notes" | "transactions" | "jobs" | "users";

export const ROLE_PERMISSIONS: Record<UserRole, {
  label: string;
  description: string;
  modules: string[];
  canCreate: string[];
  canEdit: string[];
  canDelete: string[];
}> = {
  admin: {
    label: "Administrador",
    description: "Acceso completo a todo el sistema",
    modules: ["dashboard", "customers", "suppliers", "products", "calendar", "technicians", "notes", "finance", "jobs", "reports", "users", "settings"],
    canCreate: ["customers", "suppliers", "products", "appointments", "technicians", "notes", "transactions", "jobs", "users"],
    canEdit: ["customers", "suppliers", "products", "appointments", "technicians", "notes", "transactions", "jobs", "users"],
    canDelete: ["customers", "suppliers", "products", "appointments", "technicians", "notes", "transactions", "jobs", "users"],
  },
  manager: {
    label: "Gerente",
    description: "Gestión operativa sin acceso a configuración de usuarios",
    modules: ["dashboard", "customers", "suppliers", "products", "calendar", "technicians", "notes", "finance", "jobs", "reports", "settings"],
    canCreate: ["customers", "suppliers", "products", "appointments", "technicians", "notes", "transactions", "jobs"],
    canEdit: ["customers", "suppliers", "products", "appointments", "technicians", "notes", "transactions", "jobs"],
    canDelete: ["customers", "suppliers", "products", "appointments", "notes", "transactions", "jobs"],
  },
  technician: {
    label: "Técnico",
    description: "Acceso a agenda, trabajos asignados y notas",
    modules: ["dashboard", "calendar", "jobs", "notes"],
    canCreate: ["notes"],
    canEdit: ["jobs"],
    canDelete: [],
  },
  viewer: {
    label: "Visualizador",
    description: "Solo lectura de información básica",
    modules: ["dashboard", "customers", "products", "calendar"],
    canCreate: [],
    canEdit: [],
    canDelete: [],
  },
};

function isKnownRole(role: string): role is UserRole {
  return role === "admin" || role === "manager" || role === "technician" || role === "viewer";
}

export function hasModuleAccess(role: UserRole, module: string): boolean {
  return ROLE_PERMISSIONS[role].modules.includes(module);
}

export function canCreate(role: string, entity: string): boolean {
  return isKnownRole(role) && ROLE_PERMISSIONS[role].canCreate.includes(entity);
}

export function canEdit(role: string, entity: string): boolean {
  return isKnownRole(role) && ROLE_PERMISSIONS[role].canEdit.includes(entity);
}

export function canDelete(role: string, entity: string): boolean {
  return isKnownRole(role) && ROLE_PERMISSIONS[role].canDelete.includes(entity);
}
