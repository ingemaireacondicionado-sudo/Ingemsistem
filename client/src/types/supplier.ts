export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  cuit: string;
  category: string;
  status: 'active' | 'inactive';
  address: string;
  city: string;
  province: string;
  notes: string;
  createdAt: string;
  lastContact: string;
}

export interface SupplierFormData {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  cuit: string;
  category: string;
  status: 'active' | 'inactive';
  address: string;
  city: string;
  province: string;
  notes: string;
}
