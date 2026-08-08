export interface Product {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  subcategory: string;
  brand: string;
  model: string;
  sku: string;
  barcode: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  supplierId?: string;
  supplierName?: string;
  images: string[];
  specifications: Record<string, string>;
  notes: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ProductFormData {
  name: string;
  description: string;
  category: ProductCategory;
  subcategory: string;
  brand: string;
  model: string;
  sku: string;
  barcode: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  supplierId?: string;
  images: string[];
  specifications: Record<string, string>;
  notes: string;
  status: 'active' | 'inactive';
}

export type ProductCategory = 
  | 'aires-acondicionados'
  | 'calderas'
  | 'repuestos'
  | 'energia-solar'
  | 'electricidad'
  | 'plomeria'
  | 'herreria';

export const PRODUCT_CATEGORIES: { value: ProductCategory; label: string; icon: string }[] = [
  { value: 'aires-acondicionados', label: 'Aires Acondicionados', icon: 'Wind' },
  { value: 'calderas', label: 'Calderas', icon: 'Flame' },
  { value: 'repuestos', label: 'Repuestos', icon: 'Settings' },
  { value: 'energia-solar', label: 'Energía Solar', icon: 'Sun' },
  { value: 'electricidad', label: 'Electricidad', icon: 'Zap' },
  { value: 'plomeria', label: 'Plomería', icon: 'Droplet' },
  { value: 'herreria', label: 'Herrería', icon: 'Hammer' },
];

export const SUBCATEGORIES: Record<ProductCategory, string[]> = {
  'aires-acondicionados': [
    'Split',
    'Ventana',
    'Portátil',
    'Cassette',
    'Piso-Techo',
    'Multi-Split',
    'Central',
    'Compresores',
    'Evaporadoras',
    'Condensadoras',
    'Termostatos',
    'Kits de Instalación',
  ],
  'calderas': [
    'Calderas a Gas',
    'Calderas Eléctricas',
    'Calderas de Condensación',
    'Termotanques',
    'Radiadores',
    'Bombas de Calor',
    'Quemadores',
    'Válvulas de Seguridad',
    'Expansores',
    'Kit de Chimenea',
  ],
  'repuestos': [
    'Compresores',
    'Motores',
    'Ventiladores',
    'Capacitores',
    'Relés',
    'Termostatos',
    'Válvulas',
    'Filtros',
    'Serpentines',
    'Aislaciones',
    'Cañerías',
    'Conectores',
  ],
  'energia-solar': [
    'Paneles Solares',
    'Inversores',
    'Baterías',
    'Controladores',
    'Termotanques Solares',
    'Kits Completos',
    'Estructuras',
    'Cableado Solar',
  ],
  'electricidad': [
    'Cableado',
    'Interruptores',
    'Tomacorrientes',
    'Tableros',
    'Disyuntores',
    'Protectores',
    'Transformadores',
    'Luminarias',
    'Cajas de Paso',
    'Canaletas',
  ],
  'plomeria': [
    'Caños y Tubos',
    'Accesorios',
    'Griferías',
    'Bombas de Agua',
    'Tanques',
    'Calefones',
    'Válvulas',
    'Selladores',
    'Herramientas',
  ],
  'herreria': [
    'Estructuras Metálicas',
    'Soportes',
    'Bases',
    'Protecciones',
    'Rejas',
    'Portones',
    'Escaleras',
    'Herrajes',
  ],
};

export const BRANDS = [
  'Samsung',
  'LG',
  'Carrier',
  'Bgh',
  'Philco',
  'Daikin',
  'Midea',
  'Rheem',
  'Origen',
  'Peisa',
  'Ecotermo',
  'Longvie',
  'Calorex',
  'Trane',
  'Lennox',
  'Hitachi',
  'Toshiba',
  'Otra',
];
