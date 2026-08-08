import { useCallback, useMemo } from 'react';
import type { Technician, TechnicianFormData } from '@/types/technician';
import { trpc } from '@/lib/trpc';

export function useTechnicians() {
  const q = trpc.technicians.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.technicians.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.technicians.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.technicians.delete.useMutation({ onSuccess: () => q.refetch() });

  const technicians: Technician[] = useMemo(() =>
    (q.data ?? []).map((t: any) => {
      let docs: any = {};
      try { docs = t.documents ? (typeof t.documents === 'string' ? JSON.parse(t.documents) : t.documents) : {}; } catch { docs = {}; }
      return {
        id: String(t.id), firstName: t.firstName ?? '', lastName: t.lastName ?? '',
        phone: t.phone ?? '', email: t.email ?? '', dni: docs.dni ?? '',
        specialty: t.specialty ?? '',
        hasInsurance: docs.hasInsurance ?? false,
        insuranceExpiryDate: docs.insuranceExpiryDate ?? undefined,
        insuranceFiles: docs.insuranceFiles ?? [],
        hasCriminalRecord: docs.hasCriminalRecord ?? false,
        criminalRecordExpiryDate: docs.criminalRecordExpiryDate ?? undefined,
        criminalRecordFiles: docs.criminalRecordFiles ?? [],
        hasPlatformDocuments: docs.hasPlatformDocuments ?? false,
        platformDocumentsDate: docs.platformDocumentsDate ?? undefined,
        platformFiles: docs.platformFiles ?? [],
        notes: t.notes ?? '', isActive: t.isActive ?? true,
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString().split('T')[0] : '',
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString().split('T')[0] : '',
      };
    }), [q.data]);

  const addTechnician = useCallback(async (data: TechnicianFormData): Promise<string> => {
    const docs = JSON.stringify({
      dni: data.dni, hasInsurance: data.hasInsurance, insuranceExpiryDate: data.insuranceExpiryDate,
      insuranceFiles: data.insuranceFiles, hasCriminalRecord: data.hasCriminalRecord,
      criminalRecordExpiryDate: data.criminalRecordExpiryDate, criminalRecordFiles: data.criminalRecordFiles,
      hasPlatformDocuments: data.hasPlatformDocuments, platformDocumentsDate: data.platformDocumentsDate,
      platformFiles: data.platformFiles,
    });
    const result = await cM.mutateAsync({
      firstName: data.firstName, lastName: data.lastName, email: data.email,
      phone: data.phone, specialty: data.specialty, isActive: data.isActive,
      hireDate: '', address: '', city: '', emergencyContact: '', emergencyPhone: '',
      notes: data.notes, documents: docs,
    });
    return String(result.id);
  }, [cM]);

  const updateTechnician = useCallback(async (id: string, data: TechnicianFormData) => {
    const docs = JSON.stringify({
      dni: data.dni, hasInsurance: data.hasInsurance, insuranceExpiryDate: data.insuranceExpiryDate,
      insuranceFiles: data.insuranceFiles, hasCriminalRecord: data.hasCriminalRecord,
      criminalRecordExpiryDate: data.criminalRecordExpiryDate, criminalRecordFiles: data.criminalRecordFiles,
      hasPlatformDocuments: data.hasPlatformDocuments, platformDocumentsDate: data.platformDocumentsDate,
      platformFiles: data.platformFiles,
    });
    await uM.mutateAsync({
      id: parseInt(id), firstName: data.firstName, lastName: data.lastName,
      email: data.email, phone: data.phone, specialty: data.specialty,
      isActive: data.isActive, notes: data.notes, documents: docs,
    });
  }, [uM]);

  const deleteTechnician = useCallback(async (id: string) => { await dM.mutateAsync({ id: parseInt(id) }); }, [dM]);
  const getTechnicianById = useCallback((id: string) => technicians.find(t => t.id === id), [technicians]);
  const getActiveTechnicians = useCallback(() => technicians.filter(t => t.isActive), [technicians]);
  const getTechniciansBySpecialty = useCallback((s: string) => technicians.filter(t => t.specialty === s && t.isActive), [technicians]);

  const getStats = useCallback(() => {
    const total = technicians.length;
    const active = technicians.filter(t => t.isActive).length;
    const inactive = technicians.filter(t => !t.isActive).length;
    const withCompleteDocs = technicians.filter(t => t.isActive && t.hasInsurance && t.hasCriminalRecord && t.hasPlatformDocuments).length;
    const withMissingDocs = technicians.filter(t => t.isActive && (!t.hasInsurance || !t.hasCriminalRecord || !t.hasPlatformDocuments)).length;
    const bySpecialty: Record<string, number> = {};
    technicians.forEach(t => { bySpecialty[t.specialty] = (bySpecialty[t.specialty] || 0) + 1; });
    return { total, active, inactive, withCompleteDocs, withMissingDocs, bySpecialty };
  }, [technicians]);

  return { technicians, addTechnician, updateTechnician, deleteTechnician, getTechnicianById, getActiveTechnicians, getTechniciansBySpecialty, getStats };
}
