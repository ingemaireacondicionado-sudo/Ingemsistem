import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Package,
  DollarSign,
  Barcode,
  Wind,
  Flame,
  Settings,
  Sun,
  Zap,
  Droplet,
  Hammer,
  Calendar,
  Building2,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState } from 'react';
import type { ProductCategory } from '@/types/product';
import { useProducts } from '@/hooks/useProducts';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/dateUtils';

const categoryIcons: Record<ProductCategory, typeof Wind> = {
  'aires-acondicionados': Wind,
  'calderas': Flame,
  'repuestos': Settings,
  'energia-solar': Sun,
  'electricidad': Zap,
  'plomeria': Droplet,
  'herreria': Hammer,
};

const categoryLabels: Record<ProductCategory, string> = {
  'aires-acondicionados': 'Aires Acondicionados',
  'calderas': 'Calderas',
  'repuestos': 'Repuestos',
  'energia-solar': 'Energía Solar',
  'electricidad': 'Electricidad',
  'plomeria': 'Plomería',
  'herreria': 'Herrería',
};

const legacyCategoryMap: Record<string, ProductCategory> = {
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

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(price);
};

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole, canEditEntity, canDeleteEntity } = useAuth();
  const canViewCosts = userRole === 'admin' || userRole === 'manager';
  const canViewProfitability = userRole === 'admin';
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { products, deleteProduct } = useProducts();
  const suppliersQuery = trpc.suppliers.list.useQuery();
  const suppliers = (suppliersQuery.data ?? []).map(s => ({ id: s.id.toString(), name: s.name }));

  const product = products.find(p => p.id === id);

  if (!product) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/products">
            <Button variant="ghost" size="icon" aria-label="Volver a productos">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Producto no encontrado</h1>
        </div>
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Producto no encontrado
            </h3>
            <p className="text-slate-500 mb-4">
              El producto que buscas no existe o ha sido eliminado
            </p>
            <Link to="/products">
              <Button>Volver a la lista</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDelete = async () => {
    if (isDeleting) return;
    if (!canDeleteEntity('products')) {
      toast.error('No tenés permiso para eliminar productos');
      return;
    }

    setIsDeleting(true);
    try {
      await deleteProduct(product.id);
      navigate('/products');
    } catch (e) {
      console.error('Error deleting product:', e);
      toast.error('No se pudo eliminar el producto. Probá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const normalizedCategory = legacyCategoryMap[String(product.category)] || product.category;
  const CategoryIcon = categoryIcons[normalizedCategory] || Package;
  const isLowStock = product.stock <= product.minStock && product.stock > 0;
  const isOutOfStock = product.stock === 0;
  const grossMargin = product.salePrice > 0 ? ((product.salePrice - product.purchasePrice) / product.salePrice) * 100 : 0;
  const markup = product.purchasePrice > 0 ? ((product.salePrice - product.purchasePrice) / product.purchasePrice) * 100 : 0;
  const profit = product.salePrice - product.purchasePrice;
  const totalValue = product.purchasePrice * product.stock;

  const supplier = suppliers.find(s => s.id === product.supplierId);

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/products">
            <Button variant="ghost" size="icon" aria-label="Volver a productos">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
                {product.name}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className="bg-sky-100 text-sky-700">
                <CategoryIcon className="w-3 h-3 mr-1" />
                {categoryLabels[normalizedCategory] || product.category}
              </Badge>
              <Badge 
                variant="secondary"
                className={product.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}
              >
                {product.status === 'active' ? 'Activo' : 'Inactivo'}
              </Badge>
              {(isLowStock || isOutOfStock) && (
                <Badge className={isOutOfStock ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {isOutOfStock ? 'Sin Stock' : 'Stock Bajo'}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {(canEditEntity('products') || canDeleteEntity('products')) && (
          <div className="flex items-center gap-2">
            {canEditEntity('products') && (
              <Link to={`/products/${product.id}/edit`}>
                <Button variant="outline" aria-label="Editar producto">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </Link>
            )}
            {canDeleteEntity('products') && (
              <Button
                variant="destructive"
                aria-label="Eliminar producto"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Images & Basic Info */}
        <div className="space-y-6">
          {/* Images */}
          <Card>
            <CardContent className="p-6">
              {product.images.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {product.images.map((image, index) => (
                    <div key={index} className="aspect-square rounded-lg overflow-hidden border border-slate-200">
                      <img 
                        src={image} 
                        alt={`${product.name} ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="aspect-square bg-slate-100 rounded-lg flex flex-col items-center justify-center">
                  <CategoryIcon className="w-16 h-16 text-slate-300" />
                  <p className="text-slate-400 mt-2">Sin imágenes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Barcode className="w-5 h-5 text-sky-600" />
                Información Básica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-slate-500">SKU</p>
                <p className="font-mono font-medium text-slate-800">{product.sku}</p>
              </div>
              {product.barcode && (
                <div>
                  <p className="text-sm text-slate-500">Código de Barras</p>
                  <p className="font-mono font-medium text-slate-800">{product.barcode}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-slate-500">Marca</p>
                <p className="font-medium text-slate-800">{product.brand}</p>
              </div>
              {product.model && (
                <div>
                  <p className="text-sm text-slate-500">Modelo</p>
                  <p className="font-medium text-slate-800">{product.model}</p>
                </div>
              )}
              {product.subcategory && (
                <div>
                  <p className="text-sm text-slate-500">Subcategoría</p>
                  <p className="font-medium text-slate-800">{product.subcategory}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Supplier */}
          {supplier && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-sky-600" />
                  Proveedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-sky-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{supplier.name}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {product.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Descripción</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-700">{product.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Prices */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-sky-600" />
                {canViewProfitability ? 'Precios y Rentabilidad' : 'Precios'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid grid-cols-1 gap-6 ${canViewProfitability ? 'sm:grid-cols-3' : canViewCosts ? 'sm:grid-cols-2' : ''}`}>
                {canViewCosts && (
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <p className="text-sm text-slate-500">Precio de Compra</p>
                    <p className="text-2xl font-bold text-slate-800">{formatPrice(product.purchasePrice)}</p>
                  </div>
                )}
                <div className="bg-sky-50 p-4 rounded-lg">
                  <p className="text-sm text-slate-500">Precio de Venta</p>
                  <p className="text-2xl font-bold text-sky-700">{formatPrice(product.salePrice)}</p>
                </div>
                {canViewProfitability && (
                  <div className="bg-emerald-50 p-4 rounded-lg">
                    <p className="text-sm text-slate-500">Ganancia por Unidad</p>
                    <p className="text-2xl font-bold text-emerald-700">{formatPrice(profit)}</p>
                  </div>
                )}
              </div>
              {canViewProfitability && product.purchasePrice > 0 && product.salePrice > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  <span className="text-slate-600">Margen bruto:</span>
                  <span className="font-semibold text-emerald-600">{grossMargin.toFixed(1)}%</span>
                  <span className="text-slate-500 text-sm">Recargo sobre costo: {markup.toFixed(1)}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stock */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-sky-600" />
                Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid grid-cols-1 gap-6 ${canViewProfitability ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <div className={`p-4 rounded-lg ${isOutOfStock ? 'bg-red-50' : isLowStock ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                  <p className="text-sm text-slate-500">Stock Actual</p>
                  <p className={`text-2xl font-bold ${isOutOfStock ? 'text-red-700' : isLowStock ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {product.stock} unidades
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-sm text-slate-500">Stock Mínimo</p>
                  <p className="text-2xl font-bold text-slate-800">{product.minStock} unidades</p>
                </div>
                {canViewProfitability && (
                  <div className="bg-sky-50 p-4 rounded-lg">
                    <p className="text-sm text-slate-500">Valor del Stock</p>
                    <p className="text-2xl font-bold text-sky-700">{formatPrice(totalValue)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Specifications */}
          {Object.entries(product.specifications).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="w-5 h-5 text-sky-600" />
                  Especificaciones Técnicas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key} className="flex justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-500">{key}</span>
                      <span className="font-medium text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {product.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-slate-700 whitespace-pre-wrap">{product.notes}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-600" />
                Historial
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Última actualización</span>
                  <span className="font-medium text-slate-800">
                    {parseLocalDate(product.updatedAt).toLocaleDateString('es-AR')}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Fecha de creación</span>
                  <span className="font-medium text-slate-800">
                    {parseLocalDate(product.createdAt).toLocaleDateString('es-AR')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen && canDeleteEntity('products')} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>¿Eliminar producto?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el producto
              <span className="font-semibold"> {product.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
