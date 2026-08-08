import { useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Users,
  Truck,
  Package,
  CalendarDays,
  Wrench,
  StickyNote,
  DollarSign,
  Briefcase,
  LayoutDashboard,
  Settings,
  BarChart3,
  UserCog,
  Search,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSearch } from '@/contexts/SearchContext';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  icon: React.ReactNode;
  path: string;
  badge?: { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' };
  keywords: string;
}

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, description: 'Panel principal' },
  { path: '/customers', label: 'Clientes', icon: Users, description: 'Lista de clientes' },
  { path: '/suppliers', label: 'Proveedores', icon: Truck, description: 'Lista de proveedores' },
  { path: '/products', label: 'Stock / Productos', icon: Package, description: 'Inventario' },
  { path: '/calendar', label: 'Agenda', icon: CalendarDays, description: 'Calendario de turnos' },
  { path: '/technicians', label: 'Técnicos', icon: Wrench, description: 'Equipo técnico' },
  { path: '/notes', label: 'Notas', icon: StickyNote, description: 'Notas y tareas' },
  { path: '/finance', label: 'Finanzas', icon: DollarSign, description: 'Ingresos y gastos' },
  { path: '/jobs', label: 'Trabajos', icon: Briefcase, description: 'Gestión de trabajos' },
  { path: '/reports', label: 'Reportes', icon: BarChart3, description: 'Estadísticas' },
  { path: '/users', label: 'Usuarios', icon: UserCog, description: 'Gestión de usuarios' },
  { path: '/settings', label: 'Configuración', icon: Settings, description: 'Ajustes del sistema' },
];

const QUICK_ACTIONS = [
  { path: '/customers/new', label: 'Nuevo Cliente', icon: Users, description: 'Crear un nuevo cliente' },
  { path: '/calendar/new', label: 'Nuevo Turno', icon: CalendarDays, description: 'Agendar un turno' },
  { path: '/jobs/new', label: 'Nuevo Trabajo', icon: Briefcase, description: 'Registrar un trabajo' },
  { path: '/finance/new?type=income', label: 'Registrar Ingreso', icon: DollarSign, description: 'Agregar ingreso' },
  { path: '/finance/new?type=expense', label: 'Registrar Gasto', icon: DollarSign, description: 'Agregar gasto' },
  { path: '/notes/new', label: 'Nueva Nota', icon: StickyNote, description: 'Crear una nota' },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  prospect: 'Potencial',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  in_progress: 'En Progreso',
  invoiced: 'Facturado',
  paid: 'Pagado',
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export function GlobalSearch() {
  const { data, isOpen, setIsOpen } = useSearch();
  const { customers, suppliers, appointments, technicians, notes, transactions, jobs } = data;
  const navigate = useNavigate();

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === 'F3') {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen, setIsOpen]);

  const handleSelect = useCallback((path: string) => {
    setIsOpen(false);
    navigate(path);
  }, [navigate, setIsOpen]);

  // Build searchable items
  const searchResults = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = [];

    // Customers
    customers.forEach((c) => {
      const name = c.customerType === 'company' 
        ? (c.company || `${c.firstName} ${c.lastName}`)
        : `${c.firstName} ${c.lastName}`;
      results.push({
        id: `customer-${c.id}`,
        title: name,
        subtitle: [c.phone, c.email, c.city].filter(Boolean).join(' · '),
        category: 'Clientes',
        icon: <Users className="w-4 h-4 text-sky-600" />,
        path: `/customers/${c.id}`,
        badge: c.status === 'active' 
          ? { label: 'Activo', variant: 'default' as const }
          : c.status === 'prospect'
          ? { label: 'Potencial', variant: 'secondary' as const }
          : { label: 'Inactivo', variant: 'outline' as const },
        keywords: `${name} ${c.phone} ${c.email} ${c.cuit} ${c.company} ${c.city} ${c.address} cliente`,
      });
    });

    // Suppliers
    suppliers.forEach((s) => {
      results.push({
        id: `supplier-${s.id}`,
        title: s.name,
        subtitle: [s.contactName, s.phone, s.category].filter(Boolean).join(' · '),
        category: 'Proveedores',
        icon: <Truck className="w-4 h-4 text-orange-600" />,
        path: `/suppliers/${s.id}`,
        badge: s.status === 'active'
          ? { label: 'Activo', variant: 'default' as const }
          : { label: 'Inactivo', variant: 'outline' as const },
        keywords: `${s.name} ${s.contactName} ${s.phone} ${s.email} ${s.cuit} ${s.category} proveedor`,
      });
    });

    // Appointments
    appointments.forEach((a) => {
      const dateStr = new Date(a.date).toLocaleDateString('es-AR', { 
        weekday: 'short', day: 'numeric', month: 'short' 
      });
      results.push({
        id: `appointment-${a.id}`,
        title: a.title,
        subtitle: `${dateStr} ${a.time} · ${a.clientName}${a.technicianNames?.length ? ' · ' + a.technicianNames.join(', ') : ''}`,
        category: 'Turnos',
        icon: <CalendarDays className="w-4 h-4 text-emerald-600" />,
        path: `/calendar`,
        badge: { 
          label: STATUS_LABELS[a.status] || a.status, 
          variant: a.status === 'confirmed' ? 'default' as const : 'secondary' as const 
        },
        keywords: `${a.title} ${a.clientName} ${a.clientPhone} ${a.address} ${a.technicianNames?.join(' ')} turno cita agenda`,
      });
    });

    // Jobs
    jobs.forEach((j) => {
      results.push({
        id: `job-${j.id}`,
        title: `${j.jobNumber ? '#' + j.jobNumber + ' - ' : ''}${j.title}`,
        subtitle: `${j.clientName}${j.endDate ? ' · ' + new Date(j.endDate).toLocaleDateString('es-AR') : ''}`,
        category: 'Trabajos',
        icon: <Briefcase className="w-4 h-4 text-purple-600" />,
        path: `/jobs/${j.id}/edit`,
        badge: { 
          label: STATUS_LABELS[j.status] || j.status, 
          variant: j.status === 'completed' || j.status === 'paid' ? 'default' as const : 'secondary' as const 
        },
        keywords: `${j.title} ${j.jobNumber} ${j.clientName} ${j.description} trabajo`,
      });
    });

    // Technicians
    technicians.forEach((t) => {
      results.push({
        id: `technician-${t.id}`,
        title: `${t.firstName} ${t.lastName}`,
        subtitle: [t.specialty, t.phone, t.email].filter(Boolean).join(' · '),
        category: 'Técnicos',
        icon: <Wrench className="w-4 h-4 text-amber-600" />,
        path: `/technicians`,
        badge: t.isActive
          ? { label: 'Activo', variant: 'default' as const }
          : { label: 'Inactivo', variant: 'outline' as const },
        keywords: `${t.firstName} ${t.lastName} ${t.phone} ${t.email} ${t.specialty} ${t.dni} tecnico`,
      });
    });

    // Notes
    notes.forEach((n) => {
      results.push({
        id: `note-${n.id}`,
        title: n.title,
        subtitle: `${n.assignedToName || 'Sin asignar'}${n.dueDate ? ' · Vence: ' + new Date(n.dueDate).toLocaleDateString('es-AR') : ''}`,
        category: 'Notas',
        icon: <StickyNote className="w-4 h-4 text-yellow-600" />,
        path: `/notes`,
        badge: { 
          label: STATUS_LABELS[n.priority] || n.priority, 
          variant: n.priority === 'urgent' || n.priority === 'high' ? 'destructive' as const : 'secondary' as const 
        },
        keywords: `${n.title} ${n.content} ${n.assignedToName} ${n.category} nota`,
      });
    });

    // Transactions (last 50 only)
    transactions.slice(0, 50).forEach((t) => {
      const amount = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.amount);
      results.push({
        id: `transaction-${t.id}`,
        title: t.description,
        subtitle: `${amount} · ${new Date(t.date).toLocaleDateString('es-AR')}`,
        category: 'Finanzas',
        icon: <DollarSign className={`w-4 h-4 ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`} />,
        path: `/finance`,
        badge: { 
          label: t.type === 'income' ? 'Ingreso' : 'Gasto', 
          variant: t.type === 'income' ? 'default' as const : 'destructive' as const 
        },
        keywords: `${t.description} ${t.relatedClientName || ''} ${t.relatedSupplierName || ''} ${t.category} finanza transaccion`,
      });
    });

    return results;
  }, [customers, suppliers, appointments, technicians, notes, transactions, jobs]);

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 cursor-pointer"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-400 bg-white rounded border border-slate-200">
          Ctrl+K
        </kbd>
      </button>

      {/* Command palette dialog */}
      <CommandDialog 
        open={isOpen} 
        onOpenChange={setIsOpen}
        title="Búsqueda Global"
        description="Buscar clientes, turnos, trabajos, notas y más..."
      >
        <CommandInput placeholder="Buscar clientes, turnos, trabajos, notas..." />
        <CommandList className="max-h-[400px]">
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-4">
              <Search className="w-8 h-8 text-slate-300" />
              <p className="text-slate-500">No se encontraron resultados</p>
              <p className="text-xs text-slate-400">Intentá con otro término de búsqueda</p>
            </div>
          </CommandEmpty>

          {/* Quick Actions */}
          <CommandGroup heading="Acciones Rápidas">
            {QUICK_ACTIONS.map((action) => (
              <CommandItem
                key={action.path}
                value={`accion ${action.label} ${action.description}`}
                onSelect={() => handleSelect(action.path)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 mr-2 shrink-0">
                  <Plus className="w-4 h-4 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-slate-500">{action.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          {/* Navigation */}
          <CommandGroup heading="Navegación">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.path}
                  value={`ir a ${item.label} ${item.description}`}
                  onSelect={() => handleSelect(item.path)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 mr-2 shrink-0">
                    <Icon className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          {/* Search Results by Category */}
          {['Clientes', 'Turnos', 'Trabajos', 'Técnicos', 'Proveedores', 'Notas', 'Finanzas'].map((category) => {
            const items = searchResults.filter((r) => r.category === category);
            if (items.length === 0) return null;
            return (
              <CommandGroup key={category} heading={category}>
                {items.map((result) => (
                  <CommandItem
                    key={result.id}
                    value={result.keywords}
                    onSelect={() => handleSelect(result.path)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50 mr-2 shrink-0">
                      {result.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{result.title}</p>
                        {result.badge && (
                          <Badge variant={result.badge.variant} className="text-[10px] shrink-0">
                            {result.badge.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{result.subtitle}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">Enter</kbd>
              seleccionar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">Esc</kbd>
              cerrar
            </span>
          </div>
          <span>{searchResults.length} resultados</span>
        </div>
      </CommandDialog>
    </>
  );
}
