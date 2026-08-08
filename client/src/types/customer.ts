export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cuit: string;
  company: string;
  position: string;
  status: 'active' | 'inactive' | 'prospect';
  customerType: 'company' | 'individual';
  address: string;
  city: string;
  country: string;
  notes: string;
  createdAt: string;
  lastContact: string;
  avatar?: string;
}

export interface CustomerFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cuit: string;
  company: string;
  position: string;
  status: 'active' | 'inactive' | 'prospect';
  customerType: 'company' | 'individual';
  address: string;
  city: string;
  country: string;
  notes: string;
}
