import { useCallback, useMemo } from 'react';
import type { Supplier, SupplierFormData } from '@/types/supplier';
import { trpc } from '@/lib/trpc';

export function useSuppliers() {
  const q = trpc.suppliers.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.suppliers.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.suppliers.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.suppliers.delete.useMutation({ onSuccess: () => q.refetch() });

  const suppliers: Supplier[] = useMemo(() =>
    (q.data ?? []).map((s: any) => ({
      id: String(s.id), name: s.name ?? '', contactName: s.contactName ?? '',
      email: s.email ?? '', phone: s.phone ?? '', cuit: s.cuit ?? '',
      category: s.category ?? '', status: s.isActive ? 'active' as const : 'inactive' as const,
      address: s.address ?? '', city: s.city ?? '', province: s.city ?? '',
      notes: s.notes ?? '',
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : '',
      lastContact: s.lastContact ? new Date(s.lastContact).toISOString().split('T')[0] : '',
    })), [q.data]);

  const categories = useMemo(() => [
    'Equipos de Refrigeración', 'Ventilación y Aire Acondicionado',
    'Materiales y Cañerías', 'Repuestos y Accesorios',
    'Gases Industriales', 'Herramientas y Equipamiento', 'Electricidad', 'Otros',
  ], []);

  const addSupplier = useCallback(async (data: SupplierFormData): Promise<string> => {
    const result = await cM.mutateAsync({
      name: data.name, contactName: data.contactName, email: data.email,
      phone: data.phone, cuit: data.cuit, category: data.category,
      address: data.address, city: data.city, country: 'Argentina',
      website: '', notes: data.notes, rating: 0, isActive: data.status !== 'inactive',
    });
    return String(result.id);
  }, [cM]);

  const updateSupplier = useCallback(async (id: string, data: SupplierFormData) => {
    await uM.mutateAsync({
      id: parseInt(id), name: data.name, contactName: data.contactName,
      email: data.email, phone: data.phone, cuit: data.cuit, category: data.category,
      address: data.address, city: data.city, notes: data.notes,
      isActive: data.status !== 'inactive',
    } as any);
  }, [uM]);

  const deleteSupplier = useCallback(async (id: string) => { await dM.mutateAsync({ id: parseInt(id) }); }, [dM]);
  const getSupplierById = useCallback((id: string) => suppliers.find(s => s.id === id), [suppliers]);

  const getStats = useCallback(() => {
    const total = suppliers.length;
    const active = suppliers.filter(s => s.status === 'active').length;
    const inactive = suppliers.filter(s => s.status === 'inactive').length;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const newThisMonth = suppliers.filter(s => s.createdAt.startsWith(thisMonth)).length;
    return { total, active, inactive, newThisMonth };
  }, [suppliers]);

  return { suppliers, categories, addSupplier, updateSupplier, deleteSupplier, getSupplierById, getStats };
}
