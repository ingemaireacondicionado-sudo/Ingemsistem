
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  FileText,
  MoreVertical,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Transaction } from '@/types/transaction';
import { 
  formatCurrency, 
  getTransactionTypeColor, 
  getTransactionTypeLabel,
  getCategoryLabel,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
} from '@/types/transaction';
import { parseLocalDate } from '@/lib/dateUtils';
import { useAuth } from '@/contexts/AuthContext';
interface FinanceListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
}

export function FinanceList({ transactions, onDelete }: FinanceListProps) {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isViewer = userRole === 'viewer';
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: (() => { const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
    end: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showIvaDetail, setShowIvaDetail] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filtrar transacciones
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        searchTerm === '' ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.relatedClientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.relatedSupplierName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
      const matchesPaymentMethod = filterPaymentMethod === 'all' || t.paymentMethod === filterPaymentMethod;
      const matchesDateRange = t.date >= dateRange.start && t.date <= dateRange.end;

      // Filtro por tab
      const matchesTab = 
        activeTab === 'all' ||
        (activeTab === 'income' && t.type === 'income') ||
        (activeTab === 'expense' && t.type === 'expense');

      return matchesSearch && matchesCategory && matchesPaymentMethod && matchesDateRange && matchesTab;
    }).sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
  }, [transactions, searchTerm, filterCategory, filterPaymentMethod, dateRange, activeTab]);

  // Estadísticas del período seleccionado
  const stats = useMemo(() => {
    const filtered = transactions.filter(t => t.date >= dateRange.start && t.date <= dateRange.end);
    const incomes = filtered.filter(t => t.type === 'income');
    const expenses = filtered.filter(t => t.type === 'expense');

    const totalIncome = incomes.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalExpense = expenses.reduce((sum, t) => sum + t.totalAmount, 0);
    const balance = totalIncome - totalExpense;

    const ivaDebit = incomes.reduce((sum, t) => sum + t.ivaAmount, 0);
    const ivaCredit = expenses.reduce((sum, t) => sum + t.ivaAmount, 0);
    const ivaBalance = ivaDebit - ivaCredit;

    return {
      totalIncome,
      totalExpense,
      balance,
      incomeCount: incomes.length,
      expenseCount: expenses.length,
      ivaDebit,
      ivaCredit,
      ivaBalance,
    };
  }, [transactions, dateRange]);

  const handleDelete = () => {
    if (selectedTransaction) {
      onDelete(selectedTransaction.id);
      setDeleteDialogOpen(false);
      setSelectedTransaction(null);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold truncate">Finanzas</h1>
          <p className="text-xs sm:text-sm text-slate-500 truncate">Ingresos, gastos e IVA</p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate('/finance/reports')} className="hidden sm:flex">
            <BarChart3 className="w-4 h-4 mr-1" />
            Reportes
          </Button>
          <Button variant="outline" size="icon" aria-label="Ver reportes" onClick={() => navigate('/finance/reports')} className="h-11 w-11 touch-manipulation sm:hidden">
            <BarChart3 className="w-4 h-4" />
          </Button>
          {!isViewer && (
            <Button 
              size="sm"
              className="h-11 touch-manipulation bg-emerald-600 px-3 text-sm hover:bg-emerald-700 sm:h-9"
              onClick={() => navigate('/finance/income/new')}
            >
              <TrendingUp className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Ingreso</span>
            </Button>
          )}
          {!isViewer && (
            <Button 
              size="sm"
              className="h-11 touch-manipulation bg-red-600 px-3 text-sm hover:bg-red-700 sm:h-9"
              onClick={() => navigate('/finance/expense/new')}
            >
              <TrendingDown className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Gasto</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards - Compact on mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-4">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-2 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-emerald-600 font-medium">Ingresos</p>
                <p className="text-sm sm:text-2xl font-bold text-emerald-700 truncate">{formatCurrency(stats.totalIncome)}</p>
                <p className="text-xs text-emerald-600">{stats.incomeCount} trans.</p>
              </div>
              <TrendingUp className="w-5 h-5 sm:w-10 sm:h-10 text-emerald-500 flex-shrink-0 ml-1" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-2 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-red-600 font-medium">Gastos</p>
                <p className="text-sm sm:text-2xl font-bold text-red-700 truncate">{formatCurrency(stats.totalExpense)}</p>
                <p className="text-xs text-red-600">{stats.expenseCount} trans.</p>
              </div>
              <TrendingDown className="w-5 h-5 sm:w-10 sm:h-10 text-red-500 flex-shrink-0 ml-1" />
            </div>
          </CardContent>
        </Card>

        <Card className={stats.balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}>
          <CardContent className="p-2 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className={`text-xs sm:text-sm font-medium ${stats.balance >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                  Balance
                </p>
                <p className={`text-sm sm:text-2xl font-bold truncate ${stats.balance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                  {formatCurrency(stats.balance)}
                </p>
                <p className={`text-xs ${stats.balance >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                  {stats.balance >= 0 ? 'Flujo positivo' : 'Flujo negativo'}
                </p>
              </div>
              <DollarSign className={`w-5 h-5 sm:w-10 sm:h-10 flex-shrink-0 ml-1 ${stats.balance >= 0 ? 'text-blue-500' : 'text-amber-500'}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-2 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-purple-600 font-medium">Saldo IVA</p>
                <p className="text-sm sm:text-2xl font-bold text-purple-700 truncate">{formatCurrency(stats.ivaBalance)}</p>
                <p className="text-xs text-purple-600">
                  {stats.ivaBalance > 0 ? 'A pagar' : stats.ivaBalance < 0 ? 'A favor' : 'Sin saldo'}
                </p>
              </div>
              <FileText className="w-5 h-5 sm:w-10 sm:h-10 text-purple-500 flex-shrink-0 ml-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* IVA Detail - Collapsible on mobile */}
      <Card>
        <button 
          className="w-full flex items-center justify-between p-2.5 sm:p-4 text-left"
          onClick={() => setShowIvaDetail(!showIvaDetail)}
        >
          <span className="text-xs sm:text-sm font-medium text-slate-500">Detalle de IVA</span>
          {showIvaDetail ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showIvaDetail && (
          <CardContent className="pt-0 pb-3 px-2.5 sm:px-4">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-4 text-center">
              <div>
                <p className="text-xs sm:text-sm text-slate-500">IVA Débito</p>
                <p className="text-xs sm:text-lg font-semibold text-emerald-600">{formatCurrency(stats.ivaDebit)}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500">IVA Crédito</p>
                <p className="text-xs sm:text-lg font-semibold text-red-600">{formatCurrency(stats.ivaCredit)}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-slate-500">Saldo IVA</p>
                <p className={`text-xs sm:text-lg font-semibold ${stats.ivaBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(stats.ivaBalance)}
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Filters - Collapsible on mobile */}
      <Card>
        <CardContent className="p-2.5 sm:p-4">
          {/* Date Range - Always visible */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-center mb-2 sm:flex sm:flex-wrap sm:gap-2">
            <Calendar className="hidden w-4 h-4 text-slate-400 flex-shrink-0 sm:block" />
            <Input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="h-11 w-full min-w-0 text-base sm:h-9 sm:w-auto sm:text-sm"
            />
            <span className="text-slate-400 text-xs">a</span>
            <Input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="h-11 w-full min-w-0 text-base sm:h-9 sm:w-auto sm:text-sm"
            />
          </div>

          {/* Search - Always visible */}
          <div className="relative mb-2 sm:mb-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 pl-9 text-base sm:h-9 sm:pl-10 sm:text-sm"
            />
          </div>

          {/* Toggle filters on mobile */}
          <button 
            type="button"
            className="mt-1.5 flex min-h-11 touch-manipulation items-center gap-1 text-sm font-medium text-sky-600 sm:hidden"
            onClick={() => setShowFilters(!showFilters)}
          >
            Filtros {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Category & Payment filters */}
          <div className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-wrap gap-1.5 sm:gap-2 mt-2`}>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-base sm:min-h-9 sm:flex-none sm:px-3 sm:py-2 sm:text-sm"
            >
              <option value="all">Todas las categorías</option>
              <optgroup label="Ingresos">
                {INCOME_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Gastos">
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </optgroup>
            </select>

            <select
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-base sm:min-h-9 sm:flex-none sm:px-3 sm:py-2 sm:text-sm"
            >
              <option value="all">Todos los métodos</option>
              {PAYMENT_METHODS.map(p => (
                <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-11 w-full max-w-md grid-cols-3 sm:h-10">
          <TabsTrigger value="all" className="text-xs sm:text-sm">Todas</TabsTrigger>
          <TabsTrigger value="income" className="text-emerald-600 text-xs sm:text-sm">Ingresos</TabsTrigger>
          <TabsTrigger value="expense" className="text-red-600 text-xs sm:text-sm">Gastos</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Transactions List - Cards on mobile, Table on desktop */}
      <Card>
        <CardContent className="p-0">
          {/* Desktop Table - Hidden on mobile */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Fecha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Tipo</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Descripción</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500">Monto</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500">IVA</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500">Total</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-500">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-xs">
                      {parseLocalDate(transaction.date).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={`${getTransactionTypeColor(transaction.type)} text-xs`}>
                        {getTransactionTypeLabel(transaction.type)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-xs">{transaction.description}</p>
                      <p className="text-xs text-slate-500">{getCategoryLabel(transaction.category)}</p>
                      {transaction.invoiceNumber && (
                        <p className="text-xs text-slate-400">
                          Fact: {transaction.invoiceType} - {transaction.invoiceNumber}
                        </p>
                      )}
                      {(transaction.cuitComprador || transaction.cuitVendedor) && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {transaction.cuitComprador && <span>CUIT C: {transaction.cuitComprador}</span>}
                          {transaction.cuitComprador && transaction.cuitVendedor && <span> | </span>}
                          {transaction.cuitVendedor && <span>CUIT V: {transaction.cuitVendedor}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-500">
                      {transaction.ivaRate > 0 ? `${transaction.ivaRate}%` : '-'}
                      <br />
                      <span className="text-xs">{formatCurrency(transaction.ivaAmount)}</span>
                    </td>
                    <td className={`px-3 py-2.5 text-right text-xs font-semibold ${
                      transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.totalAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {!isViewer && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-7 sm:w-7 touch-manipulation" aria-label={`Acciones de ${transaction.description}`}>
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/finance/${transaction.id}/edit`)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => { setSelectedTransaction(transaction); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards - Hidden on desktop */}
          <div className="md:hidden divide-y">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="p-2.5 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge className={`${getTransactionTypeColor(transaction.type)} text-xs px-1.5 py-0`}>
                        {getTransactionTypeLabel(transaction.type)}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {parseLocalDate(transaction.date).toLocaleDateString('es-AR')}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-slate-800">{transaction.description}</p>
                    <p className="text-xs text-slate-500">{getCategoryLabel(transaction.category)}</p>
                    {transaction.invoiceNumber && (
                      <p className="text-xs text-slate-400">
                        Fact: {transaction.invoiceType} - {transaction.invoiceNumber}
                      </p>
                    )}
                    {(transaction.cuitComprador || transaction.cuitVendedor) && (
                      <div className="text-xs text-slate-400">
                        {transaction.cuitComprador && <span>CUIT C: {transaction.cuitComprador}</span>}
                        {transaction.cuitComprador && transaction.cuitVendedor && <span> | </span>}
                        {transaction.cuitVendedor && <span>CUIT V: {transaction.cuitVendedor}</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${
                      transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.totalAmount)}
                    </p>
                    {transaction.ivaRate > 0 && (
                      <p className="text-xs text-slate-400">IVA: {formatCurrency(transaction.ivaAmount)}</p>
                    )}
                    {!isViewer && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="mt-0.5 h-11 w-11 touch-manipulation sm:h-7 sm:w-7" aria-label={`Acciones de ${transaction.description}`}>
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/finance/${transaction.id}/edit`)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => { setSelectedTransaction(transaction); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredTransactions.length === 0 && (
            <div className="text-center py-8 sm:py-12">
              <DollarSign className="w-10 h-10 sm:w-16 sm:h-16 mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm sm:text-lg font-medium text-slate-600 mb-1.5">No hay transacciones</h3>
              <p className="text-xs sm:text-sm text-slate-500 mb-3">Registra tu primer ingreso o gasto</p>
              {!isViewer && (
              <div className="flex gap-2 justify-center">
                <Button size="sm" onClick={() => navigate('/finance/income/new')} className="min-h-11 touch-manipulation bg-emerald-600 text-sm sm:min-h-9">
                  <TrendingUp className="w-3.5 h-3.5 mr-1" />
                  Ingreso
                </Button>
                <Button size="sm" onClick={() => navigate('/finance/expense/new')} className="min-h-11 touch-manipulation bg-red-600 text-sm sm:min-h-9">
                  <TrendingDown className="w-3.5 h-3.5 mr-1" />
                  Gasto
                </Button>
              </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">Eliminar Transacción</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              ¿Estás seguro de eliminar <strong>{selectedTransaction?.description}</strong>?
              <br />
              Monto: {selectedTransaction && formatCurrency(selectedTransaction.totalAmount)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
