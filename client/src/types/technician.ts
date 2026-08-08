export interface TechnicianFile {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'other';
  url: string;
  size: number;
  uploadedAt: string;
}

export interface Technician {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dni: string;
  specialty: string;
  // Requisitos de documentación
  hasInsurance: boolean;
  insuranceExpiryDate?: string;
  insuranceFiles: TechnicianFile[];
  hasCriminalRecord: boolean;
  criminalRecordExpiryDate?: string;
  criminalRecordFiles: TechnicianFile[];
  hasPlatformDocuments: boolean;
  platformDocumentsDate?: string;
  platformFiles: TechnicianFile[];
  // Notas
  notes: string;
  // Estado
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dni: string;
  specialty: string;
  hasInsurance: boolean;
  insuranceExpiryDate?: string;
  insuranceFiles: TechnicianFile[];
  hasCriminalRecord: boolean;
  criminalRecordExpiryDate?: string;
  criminalRecordFiles: TechnicianFile[];
  hasPlatformDocuments: boolean;
  platformDocumentsDate?: string;
  platformFiles: TechnicianFile[];
  notes: string;
  isActive: boolean;
}

export const TECHNICIAN_SPECIALTIES = [
  { value: 'aire_acondicionado', label: 'Aire Acondicionado' },
  { value: 'calefaccion', label: 'Calefacción' },
  { value: 'plomeria', label: 'Plomería' },
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'herreria', label: 'Herrería' },
  { value: 'solar', label: 'Energía Solar' },
  { value: 'general', label: 'Técnico General' },
  { value: 'multi', label: 'Multidisciplinario' },
];

// Función para verificar si un técnico tiene documentación vigente
export function checkTechnicianDocumentation(tech: Technician): {
  isValid: boolean;
  missingDocuments: string[];
  expiredDocuments: string[];
  warnings: string[];
} {
  const missingDocuments: string[] = [];
  const expiredDocuments: string[] = [];
  const warnings: string[] = [];
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  // Verificar seguro
  if (!tech.hasInsurance) {
    missingDocuments.push('Seguro de responsabilidad civil');
  } else if (tech.insuranceExpiryDate) {
    const expiryDate = new Date(tech.insuranceExpiryDate);
    if (expiryDate < today) {
      expiredDocuments.push('Seguro (vencido)');
    } else if (expiryDate < thirtyDaysFromNow) {
      warnings.push(`Seguro vence el ${tech.insuranceExpiryDate}`);
    }
  }

  // Verificar antecedentes penales
  if (!tech.hasCriminalRecord) {
    missingDocuments.push('Certificado de antecedentes penales');
  } else if (tech.criminalRecordExpiryDate) {
    const expiryDate = new Date(tech.criminalRecordExpiryDate);
    if (expiryDate < today) {
      expiredDocuments.push('Antecedentes penales (vencido)');
    } else if (expiryDate < thirtyDaysFromNow) {
      warnings.push(`Antecedentes vencen el ${tech.criminalRecordExpiryDate}`);
    }
  }

  // Verificar documentación en plataforma
  if (!tech.hasPlatformDocuments) {
    missingDocuments.push('Documentación cargada en plataforma');
  }

  return {
    isValid: missingDocuments.length === 0 && expiredDocuments.length === 0,
    missingDocuments,
    expiredDocuments,
    warnings,
  };
}

// Función para obtener el estado visual del técnico
export function getTechnicianStatus(tech: Technician): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (!tech.isActive) {
    return { label: 'Inactivo', color: 'text-slate-500', bgColor: 'bg-slate-100' };
  }

  const docStatus = checkTechnicianDocumentation(tech);
  
  if (docStatus.expiredDocuments.length > 0) {
    return { label: 'Documentación Vencida', color: 'text-red-700', bgColor: 'bg-red-100' };
  }
  
  if (docStatus.missingDocuments.length > 0) {
    return { label: 'Falta Documentación', color: 'text-amber-700', bgColor: 'bg-amber-100' };
  }
  
  if (docStatus.warnings.length > 0) {
    return { label: 'Próximo a Vencer', color: 'text-orange-700', bgColor: 'bg-orange-100' };
  }
  
  return { label: 'Documentación OK', color: 'text-emerald-700', bgColor: 'bg-emerald-100' };
}
