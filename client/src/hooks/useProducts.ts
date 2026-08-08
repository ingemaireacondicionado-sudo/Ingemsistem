import { useCallback, useMemo } from 'react';
import type { Product, ProductFormData } from '@/types/product';
import { trpc } from '@/lib/trpc';

export function useProducts() {
  const q = trpc.products.list.useQuery(undefined, { staleTime: 10000 });
  const cM = trpc.products.create.useMutation({ onSuccess: () => q.refetch() });
  const uM = trpc.products.update.useMutation({ onSuccess: () => q.refetch() });
  const dM = trpc.products.delete.useMutation({ onSuccess: () => q.refetch() });

  const products: Product[] = useMemo(() =>
    (q.data ?? []).map((p: any) => ({
      id: String(p.id), name: p.name ?? '', description: p.description ?? '',
      category: p.category ?? 'repuestos', subcategory: p.subcategory ?? '',
      brand: p.brand ?? '', model: p.model ?? '', sku: p.sku ?? '', barcode: p.barcode ?? '',
      purchasePrice: parseFloat(p.costPrice ?? p.purchasePrice ?? '0'),
      salePrice: parseFloat(p.salePrice ?? '0'),
      stock: p.stock ?? 0, minStock: p.minStock ?? 0,
      supplierId: p.supplierId ? String(p.supplierId) : undefined,
      supplierName: p.supplierName ?? undefined,
      images: [], specifications: {},
      notes: p.notes ?? '', status: p.isActive ? 'active' as const : 'inactive' as const,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : '',
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : '',
    })), [q.data]);

  const addProduct = useCallback(async (data: ProductFormData): Promise<string> => {
    const result = await cM.mutateAsync({
      name: data.name, description: data.description, category: data.category,
      brand: data.brand, model: data.model, sku: data.sku,
      costPrice: String(data.purchasePrice ?? 0), salePrice: String(data.salePrice ?? 0),
      stock: data.stock, minStock: data.minStock,
      supplierId: data.supplierId ? parseInt(data.supplierId) : null,
      unit: 'unidad', location: '', isActive: data.status !== 'inactive',
    });
    return String(result.id);
  }, [cM]);

  const updateProduct = useCallback(async (id: string, data: ProductFormData) => {
    await uM.mutateAsync({
      id: parseInt(id), name: data.name, description: data.description,
      category: data.category, brand: data.brand, model: data.model, sku: data.sku,
      costPrice: String(data.purchasePrice ?? 0), salePrice: String(data.salePrice ?? 0),
      stock: data.stock, minStock: data.minStock,
      supplierId: data.supplierId ? parseInt(data.supplierId) : null,
      isActive: data.status !== 'inactive',
    } as any);
  }, [uM]);

  const deleteProduct = useCallback(async (id: string) => { await dM.mutateAsync({ id: parseInt(id) }); }, [dM]);
  const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);

  const getStats = useCallback(() => {
    const total = products.length;
    const active = products.filter(p => p.status === 'active').length;
    const inactive = products.filter(p => p.status === 'inactive').length;
    const lowStock = products.filter(p => p.stock <= p.minStock && p.status === 'active').length;
    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
    const totalValue = products.reduce((sum, p) => sum + (p.purchasePrice * p.stock), 0);
    const byCategory: Record<string, number> = {};
    products.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + 1; });
    return { total, active, inactive, lowStock, totalStock, totalValue, byCategory };
  }, [products]);

  return { products, addProduct, updateProduct, deleteProduct, getProductById, getStats };
}
