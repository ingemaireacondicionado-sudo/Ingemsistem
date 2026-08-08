
import { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Briefcase,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import type { Customer } from '@/types/customer';
import type { Transaction } from '@/types/transaction';
import type { Job } from '@/types/job';
import type { Product } from '@/types/product';
import type { Appointment } from '@/types/appointment';
import type { Technician } from '@/types/technician';
import { parseLocalDate } from '@/lib/dateUtils';
import { formatCurrency } from '@/types/transaction';
import { JOB_STATUS } from '@/types/job';
import { APPOINTMENT_STATUS } from '@/types/appointment';
import { useAuth } from '@/contexts/AuthContext';
import { calculateJobMargin, calculateNetMonthlyProfit, formatMarginChip, getMarginColor } from '@/lib/marginUtils';

interface ReportsProps {
  customers: Customer[];
  transactions: Transaction[];
  jobs: Job[];
  products?: Product[];
  appointments: Appointment[];
  technicians: Technician[];
}

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CHART_COLORS = {
  income: '#10b981',
  expense: '#ef4444',
  balance: '#3b82f6',
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  accent: '#f59e0b',
  muted: '#94a3b8',
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function CustomTooltip({ active, payload, label, isCurrency = true }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-medium text-slate-800">
            {isCurrency ? formatCurrency(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function KPICard({ title, value, subtitle, icon: Icon, trend, trendValue, color }: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-3 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">{title}</p>
            <p className="text-lg sm:text-2xl font-bold text-slate-800 truncate">{value}</p>
            <p className="text-xs text-slate-400 truncate">{subtitle}</p>
          </div>
          <div className={`p-2 sm:p-3 rounded-xl ${color} ml-2 flex-shrink-0`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
        {trend && trendValue && (
          <div className="flex items-center gap-1 mt-3">
            {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-emerald-500" />}
            {trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-500" />}
            {trend === 'neutral' && <Minus className="w-4 h-4 text-slate-400" />}
            <span className={`text-xs font-medium ${
              trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'
            }`}>
              {trendValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Reports({ customers, transactions, jobs, products = [], appointments, technicians }: ReportsProps) {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [financePeriod, setFinancePeriod] = useState<'monthly' | 'quarterly'>('monthly');

  const year = parseInt(selectedYear);

  // Available years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    transactions.forEach(t => {
      const y = parseLocalDate(t.date).getFullYear();
      if (y > 2020 && y <= currentYear + 1) years.add(y);
    });
    jobs.forEach(j => {
      if (j.startDate) {
        const y = parseLocalDate(j.startDate).getFullYear();
        if (y > 2020 && y <= currentYear + 1) years.add(y);
      }
    });
    customers.forEach(c => {
      const y = parseLocalDate(c.createdAt).getFullYear();
      if (y > 2020 && y <= currentYear + 1) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, jobs, customers, currentYear]);

  // ========== FINANCIAL DATA ==========
  const financeByMonth = useMemo(() => {
    const data = MONTHS_SHORT.map((month, idx) => ({
      month,
      monthIndex: idx,
      ingresos: 0,
      egresos: 0,
      balance: 0,
    }));

    transactions.forEach(t => {
      const d = parseLocalDate(t.date);
      if (d.getFullYear() !== year) return;
      const monthIdx = d.getMonth();
      if (t.type === 'income') {
        data[monthIdx].ingresos += t.totalAmount;
      } else {
        data[monthIdx].egresos += t.totalAmount;
      }
    });

    data.forEach(d => {
      d.balance = d.ingresos - d.egresos;
    });

    return data;
  }, [transactions, year]);

  const financeByQuarter = useMemo(() => {
    const quarters = ['Q1 (Ene-Mar)', 'Q2 (Abr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dic)'];
    return quarters.map((label, qi) => {
      const months = [qi * 3, qi * 3 + 1, qi * 3 + 2];
      const ingresos = months.reduce((sum, m) => sum + financeByMonth[m].ingresos, 0);
      const egresos = months.reduce((sum, m) => sum + financeByMonth[m].egresos, 0);
      return { month: label, ingresos, egresos, balance: ingresos - egresos };
    });
  }, [financeByMonth]);

  const financeData = financePeriod === 'monthly' ? financeByMonth : financeByQuarter;

  const totalIncome = financeByMonth.reduce((s, d) => s + d.ingresos, 0);
  const totalExpense = financeByMonth.reduce((s, d) => s + d.egresos, 0);
  const totalBalance = totalIncome - totalExpense;
  // ========== EXPENSE BREAKDOWN ==========
  const expenseByCategory = useMemo(() => {
    const catMap: Record<string, { name: string; value: number }> = {};
    const categoryLabels: Record<string, string> = {
      purchases: 'Compras',
      salaries: 'Sueldos',
      rent: 'Alquiler',
      utilities: 'Servicios',
      transport: 'Transporte',
      materials: 'Materiales',
      tools: 'Herramientas',
      taxes: 'Impuestos',
      insurance: 'Seguros',
      maintenance: 'Mantenimiento',
      marketing: 'Publicidad',
      other_expense: 'Otros',
    };

    transactions.forEach(t => {
      if (t.type !== 'expense' || parseLocalDate(t.date).getFullYear() !== year) return;
      const label = categoryLabels[t.category] || t.category;
      if (!catMap[label]) catMap[label] = { name: label, value: 0 };
      catMap[label].value += t.totalAmount;
    });

    return Object.values(catMap)
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [transactions, year]);

  // ========== JOBS DATA ==========
  const jobsByStatus = useMemo(() => {
    const statusMap: Record<string, number> = {};
    jobs.forEach(j => {
      const d = j.startDate ? parseLocalDate(j.startDate) : parseLocalDate(j.createdAt);
      if (d.getFullYear() !== year) return;
      const label = JOB_STATUS[j.status as keyof typeof JOB_STATUS]?.label || j.status;
      statusMap[label] = (statusMap[label] || 0) + 1;
    });
    return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
  }, [jobs, year]);

  const jobsByTechnician = useMemo(() => {
    const techMap: Record<string, { name: string; completados: number; enProgreso: number; pendientes: number }> = {};

    jobs.forEach(j => {
      const d = j.startDate ? parseLocalDate(j.startDate) : parseLocalDate(j.createdAt);
      if (d.getFullYear() !== year) return;

      (j.technicianNames || []).forEach(name => {
        if (!name) return;
        if (!techMap[name]) techMap[name] = { name, completados: 0, enProgreso: 0, pendientes: 0 };
        if (j.status === 'completed' || j.status === 'invoiced' || j.status === 'paid') {
          techMap[name].completados++;
        } else if (j.status === 'in_progress') {
          techMap[name].enProgreso++;
        } else if (j.status === 'pending') {
          techMap[name].pendientes++;
        }
      });
    });

    return Object.values(techMap).sort((a, b) => 
      (b.completados + b.enProgreso + b.pendientes) - (a.completados + a.enProgreso + a.pendientes)
    );
  }, [jobs, year]);

  const jobsRevenueByMonth = useMemo(() => {
    const data = MONTHS_SHORT.map((month) => ({
      month,
      facturado: 0,
      cobrado: 0,
      pendiente: 0,
    }));

    jobs.forEach(j => {
      const d = j.startDate ? parseLocalDate(j.startDate) : parseLocalDate(j.createdAt);
      if (d.getFullYear() !== year || j.currency === 'USD' || j.status === 'cancelled') return;
      const monthIdx = d.getMonth();
      const isInvoiced = Boolean(j.invoiceNumber) || j.status === 'invoiced' || j.status === 'paid';
      if (isInvoiced) data[monthIdx].facturado += j.totalAmount;
      data[monthIdx].cobrado += j.amountPaid;
      if (isInvoiced) data[monthIdx].pendiente += Math.max(j.totalAmount - j.amountPaid, 0);
    });

    return data;
  }, [jobs, year]);

  const yearJobsAll = jobs.filter(j => {
    const d = j.startDate ? parseLocalDate(j.startDate) : parseLocalDate(j.createdAt);
    return d.getFullYear() === year && j.status !== 'cancelled';
  });
  const yearInvoicedJobs = yearJobsAll.filter(j => Boolean(j.invoiceNumber) || j.status === 'invoiced' || j.status === 'paid');
  const totalJobsRevenueARS = yearInvoicedJobs.filter(j => j.currency !== 'USD').reduce((s, j) => s + j.totalAmount, 0);
  const totalJobsRevenueUSD = yearInvoicedJobs.filter(j => j.currency === 'USD').reduce((s, j) => s + j.totalAmount, 0);
  const totalJobsPaidARS = yearInvoicedJobs.filter(j => j.currency !== 'USD').reduce((s, j) => s + j.amountPaid, 0);
  const totalJobsPaidUSD = yearInvoicedJobs.filter(j => j.currency === 'USD').reduce((s, j) => s + j.amountPaid, 0);
  const collectionRateARS = totalJobsRevenueARS > 0 ? (totalJobsPaidARS / totalJobsRevenueARS) * 100 : null;
  const collectionRateUSD = totalJobsRevenueUSD > 0 ? (totalJobsPaidUSD / totalJobsRevenueUSD) * 100 : null;
  const collectionRates = [collectionRateARS, collectionRateUSD].filter((value): value is number => value !== null);
  const hasCollectionData = collectionRates.length > 0;
  const collectionRateForStatus = collectionRates.length > 0 ? Math.min(...collectionRates) : 0;
  const collectionRateLabel = [
    collectionRateARS !== null ? `ARS ${collectionRateARS.toFixed(1)}%` : null,
    collectionRateUSD !== null ? `USD ${collectionRateUSD.toFixed(1)}%` : null,
  ].filter(Boolean).join(' · ') || 'Sin facturación';

  const formatJobsAmount = (ars: number, usd: number): string => {
    const parts: string[] = [];
    if (ars > 0) parts.push(formatCurrency(ars));
    if (usd > 0) parts.push(`US$ ${usd.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`);
    return parts.join(' · ') || '$0';
  };

  const avgTicket = useMemo(() => {
    const yearJobs = jobs.filter(j => {
      const d = j.startDate ? parseLocalDate(j.startDate) : parseLocalDate(j.createdAt);
      const isInvoiced = Boolean(j.invoiceNumber) || j.status === 'invoiced' || j.status === 'paid';
      return d.getFullYear() === year && j.status !== 'cancelled' && isInvoiced && j.totalAmount > 0 && j.currency !== 'USD';
    });
    if (yearJobs.length === 0) return 0;
    return yearJobs.reduce((s, j) => s + j.totalAmount, 0) / yearJobs.length;
  }, [jobs, year]);

  // ========== CLIENTS DATA ==========
  const clientsByMonth = useMemo(() => {
    const data = MONTHS_SHORT.map((month) => ({
      month,
      nuevos: 0,
      acumulado: 0,
    }));

    const yearCustomers = customers.filter(c => parseLocalDate(c.createdAt).getFullYear() === year);
    yearCustomers.forEach(c => {
      const monthIdx = parseLocalDate(c.createdAt).getMonth();
      data[monthIdx].nuevos++;
    });

    let acc = customers.filter(c => parseLocalDate(c.createdAt).getFullYear() < year).length;
    data.forEach(d => {
      acc += d.nuevos;
      d.acumulado = acc;
    });

    return data;
  }, [customers, year]);

  const clientsByType = useMemo(() => {
    let empresas = 0;
    let particulares = 0;
    customers.forEach(c => {
      if (c.customerType === 'company') empresas++;
      else particulares++;
    });
    return [
      { name: 'Empresas', value: empresas },
      { name: 'Particulares', value: particulares },
    ].filter(c => c.value > 0);
  }, [customers]);

  const clientsByStatus = useMemo(() => {
    let activos = 0;
    let inactivos = 0;
    let potenciales = 0;
    customers.forEach(c => {
      if (c.status === 'active') activos++;
      else if (c.status === 'inactive') inactivos++;
      else potenciales++;
    });
    return [
      { name: 'Activos', value: activos },
      { name: 'Potenciales', value: potenciales },
      { name: 'Inactivos', value: inactivos },
    ].filter(c => c.value > 0);
  }, [customers]);

  // ========== APPOINTMENTS DATA ==========
  const appointmentsByMonth = useMemo(() => {
    const data = MONTHS_SHORT.map((month) => ({
      month,
      total: 0,
      completados: 0,
      cancelados: 0,
    }));

    appointments.forEach(a => {
      const d = parseLocalDate(a.date);
      if (d.getFullYear() !== year) return;
      const monthIdx = d.getMonth();
      data[monthIdx].total++;
      if (a.status === 'completed') data[monthIdx].completados++;
      if (a.status === 'cancelled') data[monthIdx].cancelados++;
    });

    return data;
  }, [appointments, year]);

  const appointmentsByStatus = useMemo(() => {
    const statusMap: Record<string, number> = {};
    appointments.forEach(a => {
      const d = parseLocalDate(a.date);
      if (d.getFullYear() !== year) return;
      const label = APPOINTMENT_STATUS[a.status as keyof typeof APPOINTMENT_STATUS]?.label || a.status;
      statusMap[label] = (statusMap[label] || 0) + 1;
    });
    return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
  }, [appointments, year]);

  // ========== RENDER ==========
  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            Reportes y Estadísticas
          </h1>
          <p className="text-slate-500 mt-1">Análisis del rendimiento de tu negocio</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="h-11 w-[130px] text-base sm:h-10 sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <KPICard
          title="Facturación Total"
          value={formatJobsAmount(totalJobsRevenueARS, totalJobsRevenueUSD)}
          subtitle={`${yearInvoicedJobs.length} trabajos facturados en ${year}`}
          icon={DollarSign}
          color="bg-blue-500"
        />
        <KPICard
          title="Ticket Promedio"
          value={formatCurrency(avgTicket)}
          subtitle="Por trabajo realizado"
          icon={TrendingUp}
          color="bg-emerald-500"
        />
        <KPICard
          title="Tasa de Cobro"
          value={collectionRateLabel}
          subtitle={`${formatJobsAmount(totalJobsPaidARS, totalJobsPaidUSD)} cobrado`}
          icon={Briefcase}
          color="bg-purple-500"
          trend={!hasCollectionData ? 'neutral' : collectionRateForStatus >= 80 ? 'up' : collectionRateForStatus >= 50 ? 'neutral' : 'down'}
          trendValue={!hasCollectionData ? 'Sin datos' : collectionRateForStatus >= 80 ? 'Buen nivel' : collectionRateForStatus >= 50 ? 'Puede mejorar' : 'Atención'}
        />
        <KPICard
          title="Clientes Totales"
          value={customers.length.toString()}
          subtitle={`${customers.filter(c => parseLocalDate(c.createdAt).getFullYear() === year).length} nuevos en ${year}`}
          icon={Users}
          color="bg-amber-500"
        />
      </div>

      {/* ===== SECTION: FINANZAS ===== */}
      <div className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            Finanzas
          </h2>
          <Tabs className="w-full sm:w-auto" value={financePeriod} onValueChange={(v) => setFinancePeriod(v as 'monthly' | 'quarterly')}>
            <TabsList className="grid h-11 w-full grid-cols-2 sm:w-auto">
              <TabsTrigger className="min-h-11 touch-manipulation sm:min-h-0" value="monthly">Mensual</TabsTrigger>
              <TabsTrigger className="min-h-11 touch-manipulation sm:min-h-0" value="quarterly">Trimestral</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Income vs Expense Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Ingresos vs Egresos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-3 sm:mb-4 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">Ingresos: {formatCurrency(totalIncome)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500" />
                  <span className="text-slate-600">Egresos: {formatCurrency(totalExpense)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${totalBalance >= 0 ? 'bg-blue-500' : 'bg-red-500'}`} />
                  <span className={`font-medium ${totalBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    Balance: {formatCurrency(totalBalance)}
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={financeData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ingresos" name="Ingresos" fill={CHART_COLORS.income} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="egresos" name="Egresos" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Expense Breakdown Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Distribución de Gastos</CardTitle>
            </CardHeader>
            <CardContent>
              {expenseByCategory.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={expenseByCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {expenseByCategory.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2 max-h-[120px] overflow-y-auto">
                    {expenseByCategory.map((cat, idx) => (
                      <div key={cat.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="text-slate-600 truncate">{cat.name}</span>
                        </div>
                        <span className="font-medium text-slate-700 ml-2">{formatCurrency(cat.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-slate-400 text-sm">
                  Sin gastos registrados en {year}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Balance Line Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-slate-700">Evolución del Balance Mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={financeByMonth}>
                <defs>
                  <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.balance} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={CHART_COLORS.balance} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name="Balance"
                  stroke={CHART_COLORS.balance}
                  fill="url(#balanceGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ===== SECTION: TRABAJOS ===== */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-purple-600" />
          Trabajos
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Jobs Revenue by Month */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Facturación y Cobros por Mes (ARS)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={jobsRevenueByMonth} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="facturado" name="Facturado" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cobrado" name="Cobrado" fill={CHART_COLORS.income} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pendiente" name="Pendiente" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Jobs by Status Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Trabajos por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              {jobsByStatus.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={jobsByStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {jobsByStatus.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {jobsByStatus.map((item, idx) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="text-slate-600">{item.name}</span>
                        </div>
                        <span className="font-medium text-slate-700">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-slate-400 text-sm">
                  Sin trabajos en {year}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Jobs by Technician */}
        {jobsByTechnician.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Trabajos por Técnico</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, jobsByTechnician.length * 50)}>
                <BarChart data={jobsByTechnician} layout="vertical" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={100} />
                  <Tooltip content={<CustomTooltip isCurrency={false} />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="completados" name="Completados" fill={CHART_COLORS.income} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="enProgreso" name="En Progreso" fill={CHART_COLORS.primary} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pendientes" name="Pendientes" fill={CHART_COLORS.accent} stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== SECTION: CLIENTES ===== */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-600" />
          Clientes
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* New Clients by Month */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Nuevos Clientes por Mes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={clientsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip isCurrency={false} />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar yAxisId="left" dataKey="nuevos" name="Nuevos" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="acumulado" name="Acumulado" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Client Distribution */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium text-slate-700">Por Tipo</CardTitle>
              </CardHeader>
              <CardContent>
                {clientsByType.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie
                          data={clientsByType}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={55}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {clientsByType.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-1">
                      {clientsByType.map((item, idx) => (
                        <div key={item.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                            <span className="text-slate-600">{item.name}</span>
                          </div>
                          <span className="font-medium text-slate-700">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[140px] text-slate-400 text-sm">Sin datos</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium text-slate-700">Por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                {clientsByStatus.length > 0 ? (
                  <div className="space-y-3">
                    {clientsByStatus.map((item, idx) => {
                      const total = customers.length || 1;
                      const pct = ((item.value / total) * 100).toFixed(0);
                      const colors = ['bg-emerald-500', 'bg-amber-500', 'bg-slate-400'];
                      return (
                        <div key={item.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">{item.name}</span>
                            <span className="font-medium text-slate-700">{item.value} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colors[idx] || 'bg-blue-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[100px] text-slate-400 text-sm">Sin datos</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ===== SECTION: AGENDA ===== */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-cyan-600" />
          Agenda / Turnos
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Appointments by Month */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Turnos por Mes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={appointmentsByMonth} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip isCurrency={false} />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="total" name="Total" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completados" name="Completados" fill={CHART_COLORS.income} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cancelados" name="Cancelados" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Appointments by Status Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-slate-700">Turnos por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              {appointmentsByStatus.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={appointmentsByStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {appointmentsByStatus.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {appointmentsByStatus.map((item, idx) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="text-slate-600">{item.name}</span>
                        </div>
                        <span className="font-medium text-slate-700">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-slate-400 text-sm">
                  Sin turnos en {year}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========== RENTABILIDAD (solo admin) ========== */}
      {isAdmin && (
      <div className="space-y-4">
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-violet-600" />
          Rentabilidad
        </h2>

        {/* Margen total por mes (gráfico) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Margen por Mes</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const marginData = MONTHS_SHORT.map((month, idx) => {
                const profit = calculateNetMonthlyProfit(jobs, products, transactions, year, idx);
                return {
                  month,
                  margen: profit.jobMarginsARS,
                  ganancia: profit.profitARS,
                };
              });
              const hasData = marginData.some(d => d.margen !== 0 || d.ganancia !== 0);
              if (!hasData) return <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">Sin datos de rentabilidad en {year}</div>;
              return (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={marginData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="margen" name="Margen trabajos" fill="#8b5cf6" radius={[4,4,0,0]} />
                    <Bar dataKey="ganancia" name="Ganancia neta" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ranking por cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base">Ranking por Cliente (ARS)</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const yearJobs = jobs.filter(j => {
                  if (!j.startDate) return false;
                  return parseLocalDate(j.startDate).getFullYear() === year && j.status !== 'cancelled' && j.currency !== 'USD';
                });
                const byClient: Record<string, { name: string; totalMargin: number; jobCount: number }> = {};
                for (const job of yearJobs) {
                  const margin = calculateJobMargin(job, products, transactions);
                  const key = job.clientName || 'Sin cliente';
                  if (!byClient[key]) byClient[key] = { name: key, totalMargin: 0, jobCount: 0 };
                  byClient[key].totalMargin += margin.marginARS;
                  byClient[key].jobCount++;
                }
                const ranked = Object.values(byClient).sort((a, b) => b.totalMargin - a.totalMargin).slice(0, 10);
                if (ranked.length === 0) return <div className="text-sm text-slate-400 text-center py-6">Sin datos</div>;
                return (
                  <div className="space-y-2">
                    {ranked.map((c, idx) => (
                      <div key={c.name} className="flex items-center justify-between text-sm p-2 rounded bg-slate-50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-slate-400 w-5">#{idx + 1}</span>
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="text-xs text-slate-400">({c.jobCount})</span>
                        </div>
                        <span className={`font-semibold whitespace-nowrap ${c.totalMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(c.totalMargin)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Top 5 mejor y peor margen */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base">Top 5 Mejor y Peor Margen</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const yearJobs = jobs.filter(j => {
                  if (!j.startDate || j.subtotal === 0) return false;
                  return parseLocalDate(j.startDate).getFullYear() === year && j.status !== 'cancelled';
                });
                const withMargin = yearJobs.map(j => {
                  const m = calculateJobMargin(j, products, transactions);
                  return { job: j, margin: m };
                });
                const sorted = withMargin.sort((a, b) => {
                  const aPct = a.margin.marginPct ?? 0;
                  const bPct = b.margin.marginPct ?? 0;
                  return bPct - aPct;
                });
                const best = sorted.slice(0, 5);
                const worst = sorted.slice(-5).reverse();
                if (sorted.length === 0) return <div className="text-sm text-slate-400 text-center py-6">Sin datos</div>;
                return (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 uppercase mb-1">Mejor margen</p>
                      <div className="space-y-1">
                        {best.map(({ job, margin }) => (
                          <div key={job.id} className="flex items-center justify-between text-xs p-1.5 bg-emerald-50 rounded">
                            <span className="truncate flex-1 mr-2">{job.jobNumber} - {job.title}</span>
                            <span className={`font-semibold ${getMarginColor(margin).split(' ')[0]}`}>{formatMarginChip(margin)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase mb-1">Peor margen</p>
                      <div className="space-y-1">
                        {worst.map(({ job, margin }) => (
                          <div key={job.id} className="flex items-center justify-between text-xs p-1.5 bg-red-50 rounded">
                            <span className="truncate flex-1 mr-2">{job.jobNumber} - {job.title}</span>
                            <span className={`font-semibold ${getMarginColor(margin).split(' ')[0]}`}>{formatMarginChip(margin)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Ganancia Neta Mensual */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Ganancia Neta Mensual</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const netData = MONTHS_SHORT.map((month, idx) => {
                const profit = calculateNetMonthlyProfit(jobs, products, transactions, year, idx);
                return {
                  month,
                  margenes: profit.jobMarginsARS,
                  ingresosGenerales: profit.generalIncomeARS,
                  gastosGenerales: profit.generalExpensesARS,
                  neto: profit.profitARS,
                };
              });
              const hasData = netData.some(d => d.neto !== 0);
              if (!hasData) return <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">Sin datos en {year}</div>;
              return (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={netData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Area type="monotone" dataKey="margenes" name="Márgenes trabajos" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="ingresosGenerales" name="Ingresos generales" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="gastosGenerales" name="Gastos generales" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="neto" name="Ganancia neta" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-3 text-xs text-slate-500">
                    <p><strong>Ganancia neta</strong> = Márgenes de trabajos + Ingresos sin trabajo asignado − Gastos generales (sin trabajo asignado)</p>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-slate-400 py-4">
        Datos actualizados al {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );
}
