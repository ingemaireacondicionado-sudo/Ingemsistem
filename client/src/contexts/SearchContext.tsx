import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Customer } from '@/types/customer';
import type { Supplier } from '@/types/supplier';
import type { Appointment } from '@/types/appointment';
import type { Technician } from '@/types/technician';
import type { Note } from '@/types/note';
import type { Transaction } from '@/types/transaction';
import type { Job } from '@/types/job';

interface SearchData {
  customers: Customer[];
  suppliers: Supplier[];
  appointments: Appointment[];
  technicians: Technician[];
  notes: Note[];
  transactions: Transaction[];
  jobs: Job[];
}

interface SearchContextType {
  data: SearchData;
  setData: (data: Partial<SearchData>) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<SearchData>({
    customers: [],
    suppliers: [],
    appointments: [],
    technicians: [],
    notes: [],
    transactions: [],
    jobs: [],
  });
  const [isOpen, setIsOpen] = useState(false);

  const setData = (partial: Partial<SearchData>) => {
    setDataState(prev => ({ ...prev, ...partial }));
  };

  return (
    <SearchContext.Provider value={{ data, setData, isOpen, setIsOpen }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used within SearchProvider');
  return ctx;
}
