import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Snowflake,
  Building2,
  Truck,
  Package,
  CalendarDays,
  Wrench,
  StickyNote,
  DollarSign,
  Briefcase,
  UserCog,
  BarChart3,
  Receipt,
  FileText,
  Send,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_PERMISSIONS } from '@/types/user';
import { GlobalSearch } from '@/components/GlobalSearch';

interface LayoutProps {
  children: React.ReactNode;
}

const ALL_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { path: '/customers', label: 'Clientes', icon: Users, module: 'customers' },
  { path: '/customers/new', label: 'Nuevo Cliente', icon: UserPlus, module: 'customers', hideInSidebar: true },
  { path: '/suppliers', label: 'Proveedores', icon: Truck, module: 'suppliers' },
  { path: '/products', label: 'Stock / Productos', icon: Package, module: 'products' },
  { path: '/calendar', label: 'Agenda', icon: CalendarDays, module: 'calendar' },
  { path: '/technicians', label: 'Técnicos', icon: Wrench, module: 'technicians' },
  { path: '/notes', label: 'Notas', icon: StickyNote, module: 'notes' },
  { path: '/finance', label: 'Finanzas', icon: DollarSign, module: 'finance' },
  { path: '/jobs', label: 'Trabajos', icon: Briefcase, module: 'jobs' },
  { path: '/presupuestos', label: 'Presupuestos', icon: Send, module: 'jobs' },
  { path: '/oc-pendientes', label: 'OC Pendientes', icon: FileText, module: 'jobs' },
  { path: '/cobranzas', label: 'Cobranzas', icon: Receipt, module: 'finance' },
  { path: '/reports', label: 'Reportes', icon: BarChart3, module: 'reports' },
  { path: '/users', label: 'Usuarios', icon: UserCog, module: 'users' },
];

// Items principales del bottom nav (los 5 más usados)
const BOTTOM_NAV_MAIN = [
  { path: '/', label: 'Inicio', icon: LayoutDashboard },
  { path: '/jobs', label: 'Trabajos', icon: Briefcase },
  { path: '/calendar', label: 'Agenda', icon: CalendarDays },
  { path: '/finance', label: 'Finanzas', icon: DollarSign },
  { path: '/customers', label: 'Clientes', icon: Users },
];

// Paths que están en el bottom nav principal
const BOTTOM_NAV_MAIN_PATHS = BOTTOM_NAV_MAIN.map(i => i.path);

// Items del menú "Más" (todos los que no están en el bottom nav principal)
const MORE_MENU_ITEMS = [
  { path: '/presupuestos', label: 'Presupuestos', icon: Send, module: 'jobs' },
  { path: '/oc-pendientes', label: 'OC Pendientes', icon: FileText, module: 'jobs' },
  { path: '/cobranzas', label: 'Cobranzas', icon: Receipt, module: 'finance' },
  { path: '/notes', label: 'Notas', icon: StickyNote, module: 'notes' },
  { path: '/suppliers', label: 'Proveedores', icon: Truck, module: 'suppliers' },
  { path: '/products', label: 'Stock / Productos', icon: Package, module: 'products' },
  { path: '/technicians', label: 'Técnicos', icon: Wrench, module: 'technicians' },
  { path: '/reports', label: 'Reportes', icon: BarChart3, module: 'reports' },
  { path: '/users', label: 'Usuarios', icon: UserCog, module: 'users' },
  { path: '/settings', label: 'Configuración', icon: Settings, module: 'settings' },
];

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasAccess, userRole } = useAuth();

  // Filtrar items de navegación según permisos
  const navItems = useMemo(() => {
    if (!userRole) return [];
    return ALL_NAV_ITEMS.filter(item => 
      !item.hideInSidebar && hasAccess(item.module)
    );
  }, [userRole, hasAccess]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Verificar si la ruta actual está en el menú "Más"
  const isInMoreMenu = useMemo(() => {
    return MORE_MENU_ITEMS.some(item => isActive(item.path));
  }, [location.pathname]);

  // Obtener el rol formateado
  const roleLabel = userRole ? ROLE_PERMISSIONS[userRole].label : '';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-200 fixed h-full">
        {/* Logo Header */}
        <div className="p-5 border-b border-slate-200">
          <Link to="/" className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
              <img 
                src={"https://files.manuscdn.com/user_upload_by_module/session_file/310419663032558987/CefAnGWPofMsrtoX.jpg"} 
                alt="INGEM" 
                className="w-12 h-12 object-contain"
              />
            </div>
            <div>
              <h1 className="font-bold text-xl text-slate-800">INGEM</h1>
              <p className="text-xs text-sky-600 flex items-center gap-1">
                <Snowflake className="w-3 h-3" />
                Termomecánica
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive(item.path)
                    ? 'bg-sky-50 text-sky-700 border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive(item.path) ? 'text-sky-600' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-slate-200">
          <Link 
            to="/settings"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 mb-2 ${
              isActive('/settings')
                ? 'bg-sky-50 text-sky-700 border border-sky-100'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Settings className={`w-5 h-5 ${isActive('/settings') ? 'text-sky-600' : 'text-slate-400'}`} />
            Configuración
          </Link>
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-sm font-semibold">
                {user?.name?.slice(0, 2).toUpperCase() || '??'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              <Badge variant="secondary" className="text-[10px] mt-1">
                {roleLabel}
              </Badge>
            </div>
          </div>
        </div>
      </aside>

      {/* Sidebar Mobile */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[280px] max-w-[85vw] bg-white flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
                  <img 
                    src={"https://files.manuscdn.com/user_upload_by_module/session_file/310419663032558987/CefAnGWPofMsrtoX.jpg"} 
                    alt="INGEM" 
                    className="w-10 h-10 object-contain"
                  />
                </div>
                <div>
                  <h1 className="font-bold text-xl text-slate-800">INGEM</h1>
                  <p className="text-xs text-sky-600">Termomecánica</p>
                </div>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <nav className="p-3 space-y-0.5 flex-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                      isActive(item.path)
                        ? 'bg-sky-50 text-sky-700 border border-sky-100'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive(item.path) ? 'text-sky-600' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                );
              })}
              <Link
                to="/settings"
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                  isActive('/settings')
                    ? 'bg-sky-50 text-sky-700 border border-sky-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Settings className={`w-5 h-5 ${isActive('/settings') ? 'text-sky-600' : 'text-slate-400'}`} />
                Configuración
              </Link>
            </nav>

            {/* Mobile User Section */}
            <div className="p-4 border-t border-slate-200">
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-sm font-semibold">
                    {user?.name?.slice(0, 2).toUpperCase() || '??'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    {roleLabel}
                  </Badge>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-72">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-3 sm:px-6 lg:px-8 h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9 flex-shrink-0"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600 flex-shrink-0" />
                <h2 className="text-sm sm:text-lg font-semibold text-slate-800 truncate">
                  {navItems.find(item => isActive(item.path))?.label || 
                   (isActive('/settings') ? 'Configuración' : 
                    location.pathname.includes('/calendar') ? 'Agenda' : 'INGEM')}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              <GlobalSearch />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-slate-100 px-1.5 sm:px-3">
                    <Avatar className="w-7 h-7 sm:w-8 sm:h-8">
                      <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-[10px] sm:text-xs font-semibold">
                        {user?.name?.slice(0, 2).toUpperCase() || '??'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:block text-left">
                      <span className="text-sm font-medium text-slate-700 block">{user?.name}</span>
                      <span className="text-xs text-slate-500">{roleLabel}</span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 hidden sm:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-xs">
                        {user?.name?.slice(0, 2).toUpperCase() || '??'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{user?.name}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1">
                        {roleLabel}
                      </Badge>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link to="/settings">
                    <DropdownMenuItem>
                      <Settings className="w-4 h-4 mr-2" />
                      Configuración
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem className="text-red-600" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-3 sm:p-6 lg:p-8 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed inset-x-3 z-50 h-16 rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-xl bottom-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <div className="flex items-center justify-around h-full px-1">
            {BOTTOM_NAV_MAIN.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors min-w-0 min-h-[44px] justify-center ${
                    active ? 'text-sky-600' : 'text-slate-400 active:text-slate-600'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active ? 'text-sky-600' : ''}`} />
                  <span className={`text-[11px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            {/* Botón "Más" */}
            <button
              onClick={() => setMoreMenuOpen(true)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors min-w-0 min-h-[44px] justify-center ${
                isInMoreMenu ? 'text-sky-600' : 'text-slate-400 active:text-slate-600'
              }`}
            >
              <MoreHorizontal className={`w-5 h-5 ${isInMoreMenu ? 'text-sky-600' : ''}`} />
              <span className={`text-[11px] leading-tight ${isInMoreMenu ? 'font-semibold' : 'font-medium'}`}>
                Más
              </span>
            </button>
          </div>
        </nav>

        {/* Drawer "Más" - Menú de módulos secundarios */}
        <Drawer open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-base font-semibold text-slate-800">Módulos</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 grid grid-cols-3 gap-2">
              {MORE_MENU_ITEMS.filter(item => item.module === 'settings' || hasAccess(item.module)).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setMoreMenuOpen(false);
                    }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95 ${
                      active 
                        ? 'bg-sky-50 text-sky-700 border border-sky-200' 
                        : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      active ? 'bg-sky-100' : 'bg-slate-100'
                    }`}>
                      <Icon className={`w-5 h-5 ${active ? 'text-sky-600' : 'text-slate-500'}`} />
                    </div>
                    <span className={`text-[11px] leading-tight text-center ${active ? 'font-semibold' : 'font-medium'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}
