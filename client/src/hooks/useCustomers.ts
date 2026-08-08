import { useCallback, useMemo } from 'react';
import type { Customer, CustomerFormData } from '@/types/customer';
import { trpc } from '@/lib/trpc';

export function useCustomers() {
  const q = trpc.customers.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.customers.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.customers.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.customers.delete.useMutation({ onSuccess: () => q.refetch() });

  const customers: Customer[] = useMemo(() =>
    (q.data ?? []).map((c: any) => ({
      id: String(c.id), firstName: c.firstName ?? '', lastName: c.lastName ?? '',
      email: c.email ?? '', phone: c.phone ?? '', cuit: c.cuit ?? '',
      company: c.company ?? '', position: c.position ?? '',
      status: c.status ?? 'prospect', customerType: c.customerType ?? 'company',
      address: c.address ?? '', city: c.city ?? '', country: c.country ?? 'Argentina',
      notes: c.notes ?? '',
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '',
      lastContact: c.lastContact ? new Date(c.lastContact).toISOString().split('T')[0] : '',
    })), [q.data]);

  const addCustomer = useCallback(async (data: CustomerFormData): Promise<string> => {
    const result = await cM.mutateAsync(data as any);
    return String(result.id);
  }, [cM]);

  const updateCustomer = useCallback(async (id: string, data: CustomerFormData) => {
    await uM.mutateAsync({ id: parseInt(id), ...data } as any);
  }, [uM]);

  const deleteCustomer = useCallback(async (id: string) => {
    await dM.mutateAsync({ id: parseInt(id) });
  }, [dM]);

  const getCustomerById = useCallback((id: string) => customers.find(c => c.id === id), [customers]);

  const getStats = useCallback(() => {
    const total = customers.length;
    const active = customers.filter(c => c.status === 'active').length;
    const inactive = customers.filter(c => c.status === 'inactive').length;
    const prospects = customers.filter(c => c.status === 'prospect').length;
    const companies = customers.filter(c => c.customerType === 'company').length;
    const individuals = customers.filter(c => c.customerType === 'individual').length;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const newThisMonth = customers.filter(c => c.createdAt.startsWith(thisMonth)).length;
    return { total, active, inactive, prospects, companies, individuals, newThisMonth };
  }, [customers]);

  return { customers, addCustomer, updateCustomer, deleteCustomer, getCustomerById, getStats };
}
