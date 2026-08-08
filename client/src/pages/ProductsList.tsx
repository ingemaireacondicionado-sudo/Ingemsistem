import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Package, AlertTriangle, EyeIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import type { Product } from '@/types/product';
import { toast } from 'sonner';

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(price);
};

export function ProductsList() {
  const navigate = useNavigate();
  const { userRole, canCreateEntity, canEditEntity, canDeleteEntity } = useAuth();
  const isViewer = userRole === 'viewer';
  const canViewCosts = userRole === 'admin' || userRole === 'manager';
  const { products, deleteProduct } = useProducts();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredProducts = products.filter((product) => {
    const search = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(search) ||
      product.sku.toLowerCase().includes(search) ||
      product.brand.toLowerCase().includes(search)
    );
  });

  const handleDelete = async () => {
    if (!productToDelete || isDeleting) return;
    if (!canDeleteEntity('products')) {
      toast.error('No tenés permiso para eliminar productos');
      return;
    }

    setIsDeleting(true);
    try {
      await deleteProduct(productToDelete.id);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (e) {
      console.error('Error deleting product:', e);
      toast.error('No se pudo eliminar el producto. Probá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip p-2 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 sm:p-4 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            Stock / Productos
            {isViewer && (
              <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300 bg-amber-50">
                <EyeIcon className="w-3 h-3 mr-1" />
                Solo lectura
              </Badge>
            )}
          </h1>
          <p className="text-slate-500">{filteredProducts.length} productos</p>
        </div>
        {!isViewer && canCreateEntity('products') && (
          <Button 
            className="bg-sky-600 hover:bg-sky-700"
            onClick={() => navigate('/products/new')}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Producto
          </Button>
        )}
      </div>

      {/* Buscador */}
      <Card>
        <CardContent className="p-4">
          <Input
            aria-label="Buscar productos"
            placeholder="Buscar por nombre, SKU o marca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Lista */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay productos</h3>
            <p className="text-slate-500 mb-4">
              {isViewer ? 'No hay productos para mostrar' : 'Agrega tu primer producto'}
            </p>
            {!isViewer && canCreateEntity('products') && (
              <Button 
                className="bg-sky-600 hover:bg-sky-700"
                onClick={() => navigate('/products/new')}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Producto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const isLowStock = product.stock <= product.minStock && product.stock > 0;
            const isOutOfStock = product.stock === 0;

            return (
              <Card
                key={product.id}
                role="link"
                tabIndex={0}
                className="hover:shadow-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                onClick={() => navigate(`/products/${product.id}`)}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/products/${product.id}`);
                  }
                }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold line-clamp-2">{product.name}</h3>
                      <p className="text-sm text-slate-500">{product.brand}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm mb-3">
                    <p className="text-slate-600">SKU: {product.sku}</p>
                    <p className="text-slate-600">{product.category}</p>
                  </div>

                  <div className={`flex items-center mb-3 ${canViewCosts ? 'justify-between' : 'justify-end'}`}>
                    {canViewCosts && (
                      <span className="text-slate-400 line-through text-sm">
                        {formatPrice(product.purchasePrice)}
                      </span>
                    )}
                    <span className="text-sky-600 font-bold text-lg">
                      {formatPrice(product.salePrice)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${
                        isOutOfStock ? 'text-red-600' :
                        isLowStock ? 'text-amber-600' :
                        'text-emerald-600'
                      }`}>
                        {product.stock} u.
                      </span>
                      {(isLowStock || isOutOfStock) && (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    {!isViewer && (
                      <div className="flex gap-1">
                        {canEditEntity('products') && (
                          <Button 
                            variant="ghost" 
                            size="icon" aria-label={`Editar ${product.name}`}
                            onClick={(e) => { e.stopPropagation(); navigate(`/products/${product.id}/edit`); }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {canDeleteEntity('products') && (
                          <Button 
                            variant="ghost" 
                            size="icon" aria-label={`Eliminar ${product.name}`}
                            className="text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProductToDelete(product);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog eliminar */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
            <DialogDescription>
              ¿Seguro que querés eliminar <strong>{productToDelete?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting || !canDeleteEntity('products')}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
