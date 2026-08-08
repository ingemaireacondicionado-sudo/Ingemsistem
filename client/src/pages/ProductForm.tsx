import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProducts } from '@/hooks/useProducts';
import type { ProductCategory } from '@/types/product';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORIES = [
  { value: 'aires-acondicionados', label: 'Aires Acondicionados' },
  { value: 'calderas', label: 'Calderas' },
  { value: 'repuestos', label: 'Repuestos' },
  { value: 'energia-solar', label: 'Energía Solar' },
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'plomeria', label: 'Plomería' },
  { value: 'herreria', label: 'Herrería' },
] satisfies { value: ProductCategory; label: string }[];

const LEGACY_CATEGORIES: Record<string, ProductCategory> = {
  'Aires Acondicionados': 'aires-acondicionados',
  Calderas: 'calderas',
  Repuestos: 'repuestos',
  'Energia Solar': 'energia-solar',
  'Energía Solar': 'energia-solar',
  Electricidad: 'electricidad',
  Plomeria: 'plomeria',
  Plomería: 'plomeria',
  Herreria: 'herreria',
  Herrería: 'herreria',
};

export function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;
  const { canCreateEntity, canEditEntity } = useAuth();
  const canManageProduct = isEditing
    ? canEditEntity('products')
    : canCreateEntity('products');
  const { products, addProduct, updateProduct } = useProducts();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory>(CATEGORIES[0].value);
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [status, setStatus] = useState('active');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditing && id) {
      const product = products.find((p) => p.id === id);
      if (product) {
        setName(product.name);
        setDescription(product.description || '');
        setCategory(LEGACY_CATEGORIES[String(product.category)] || product.category);
        setBrand(product.brand || '');
        setSku(product.sku);
        setPurchasePrice(product.purchasePrice.toString());
        setSalePrice(product.salePrice.toString());
        setStock(product.stock.toString());
        setMinStock(product.minStock.toString());
        setStatus(product.status);
      }
    }
  }, [id, isEditing, products]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!sku.trim()) {
      setError('El SKU es obligatorio');
      return;
    }
    if (products.some(product => product.id !== id && product.sku.trim().toLowerCase() === sku.trim().toLowerCase())) {
      setError('Ya existe otro producto con ese SKU');
      return;
    }
    if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
      setError('El precio de compra debe ser mayor a 0');
      return;
    }
    if (!salePrice || parseFloat(salePrice) <= 0) {
      setError('El precio de venta debe ser mayor a 0');
      return;
    }
    if ((parseInt(stock, 10) || 0) < 0 || (parseInt(minStock, 10) || 0) < 0) {
      setError('El stock no puede ser negativo');
      return;
    }

    setIsSaving(true);
    try {
      const existingProduct = isEditing && id ? products.find(product => product.id === id) : undefined;
      const productData = {
        name: name.trim(),
        description: description.trim(),
        category,
        subcategory: existingProduct?.subcategory || '',
        brand: brand.trim(),
        model: existingProduct?.model || '',
        sku: sku.trim(),
        barcode: existingProduct?.barcode || '',
        purchasePrice: parseFloat(purchasePrice),
        salePrice: parseFloat(salePrice),
        stock: parseInt(stock, 10) || 0,
        minStock: Number.isFinite(parseInt(minStock, 10)) ? parseInt(minStock, 10) : 5,
        images: existingProduct?.images || ([] as string[]),
        specifications: existingProduct?.specifications || ({} as Record<string, string>),
        notes: existingProduct?.notes || '',
        supplierId: existingProduct?.supplierId || '',
        status: status as 'active' | 'inactive',
      };

      if (isEditing && id) {
        await updateProduct(id, productData);
      } else {
        await addProduct(productData);
      }
      navigate('/products');
    } catch {
      setError('Error al guardar el producto');
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const purchaseNum = parseFloat(purchasePrice) || 0;
  const saleNum = parseFloat(salePrice) || 0;

  if (!canManageProduct) {
    return <Navigate to="/products" replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl overflow-x-clip p-2 pb-36 sm:p-4 sm:pb-36 lg:pb-6">
      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Button variant="outline" size="sm" className="h-11 touch-manipulation sm:h-10" onClick={() => navigate('/products')}>
          <ArrowLeft className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Volver</span>
        </Button>
        <h1 className="text-lg sm:text-2xl font-bold text-slate-800">
          {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Información Básica</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div>
              <Label className="text-sm">Nombre del Producto *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Aire Acondicionado Split 3000 Frigorías"
                className="h-11 sm:h-9 text-base sm:text-sm"
              />
            </div>

            <div>
              <Label className="text-sm">Descripción</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción del producto"
                rows={3}
                className="text-base sm:text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Categoría</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ProductCategory)}
                  className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm">Marca</Label>
                <Input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Ej: Samsung"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">SKU (Código interno) *</Label>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ej: AA-SAM-3000"
                className="h-11 sm:h-9 text-base sm:text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Precios</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Precio de Compra *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="285000"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Precio de Venta *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="385000"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
            </div>

            {purchaseNum > 0 && saleNum > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs sm:text-sm">
                  <strong>Margen bruto:</strong>{' '}
                  {(((saleNum - purchaseNum) / saleNum) * 100).toFixed(1)}%
                  {' '}(<strong>Ganancia:</strong> {formatCurrency(saleNum - purchaseNum)})
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Stock</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Stock Actual</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="0"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Stock Mínimo</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="5"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Estado</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botones - fijos en móvil */}
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex gap-2 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:relative lg:inset-auto lg:z-auto lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <Button type="button" variant="outline" className="flex-1 sm:flex-none h-11 sm:h-10" onClick={() => navigate('/products')}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none bg-sky-600 hover:bg-sky-700 h-11 sm:h-10" disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Producto'}
          </Button>
        </div>
      </form>
    </div>
  );
}
