import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  CreditCard,
  User,
  Building2,
  Calculator,
  Briefcase,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Transaction, TransactionFormData, TransactionType } from '@/types/transaction';
import { 
  formatCurrency, 
  calculateIVA,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  IVA_RATES,
  PAYMENT_METHODS,
  INVOICE_TYPES,
} from '@/types/transaction';
import { todayStr } from '@/lib/dateUtils';
import { normalize } from '@/lib/textUtils';
import { useAuth } from '@/contexts/AuthContext';
import { parseNonNegativeAmount } from '@/lib/formUtils';

interface TransactionFormProps {
  transactions: Transaction[];
  customers: { id: string; firstName: string; lastName: string }[];
  suppliers: { id: string; companyName: string }[];
  jobs?: { id: string; jobNumber: string; title: string; clientName: string; status: string }[];
  onSave: (data: TransactionFormData, createdBy: string) => string | Promise<string>;
  onUpdate: (id: string, data: TransactionFormData) => void | Promise<void>;
}

export function TransactionForm({ transactions, customers, suppliers, jobs = [], onSave, onUpdate }: TransactionFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(id);
  
  // Leer jobId desde URL params (deep link desde JobForm)
  const jobIdFromUrl = searchParams.get('jobId') || '';
  const clientIdFromUrl = searchParams.get('clientId') || '';
  
  // Detectar si es ingreso o gasto desde la URL
  const isIncomePath = location.pathname.includes('/income/');
  const isExpensePath = location.pathname.includes('/expense/');
  const defaultType: TransactionType = isIncomePath ? 'income' : isExpensePath ? 'expense' : 'income';

  const [type, setType] = useState<TransactionType>(defaultType);
  const [category, setCategory] = useState<string>(defaultType === 'income' ? 'services' : 'purchases');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [ivaRate, setIvaRate] = useState(21);
  const [date, setDate] = useState(todayStr());
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [relatedClientId, setRelatedClientId] = useState(clientIdFromUrl);
  const [relatedSupplierId, setRelatedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState('B');
  const [cuitComprador, setCuitComprador] = useState('');
  const [cuitVendedor, setCuitVendedor] = useState('');
  const [notes, setNotes] = useState('');
  const [relatedJobId, setRelatedJobId] = useState(jobIdFromUrl);
  const [jobSearch, setJobSearch] = useState('');

  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { user, canCreateEntity, canEditEntity } = useAuth();
  const canManageTransaction = isEditing
    ? canEditEntity('transactions')
    : canCreateEntity('transactions');

  // Filtrar trabajos para el selector
  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) return jobs.slice(0, 20);
    const q = normalize(jobSearch);
    return jobs.filter(j => 
      normalize(j.jobNumber).includes(q) ||
      normalize(j.title).includes(q) ||
      normalize(j.clientName).includes(q)
    ).slice(0, 20);
  }, [jobs, jobSearch]);

  // Calcular IVA y total
  const amountNum = parseNonNegativeAmount(amount);
  const { ivaAmount, totalAmount } = calculateIVA(amountNum, ivaRate);

  useEffect(() => {
    if (isEditing && id) {
      const transaction = transactions.find(t => t.id === id);
      if (transaction) {
        setType(transaction.type);
        setCategory(transaction.category);
        setDescription(transaction.description);
        setAmount(transaction.amount.toString());
        setIvaRate(transaction.ivaRate);
        setDate(transaction.date);
        setPaymentMethod(transaction.paymentMethod);
        setRelatedClientId(transaction.relatedClientId || '');
        setRelatedSupplierId(transaction.relatedSupplierId || '');
        setInvoiceNumber(transaction.invoiceNumber || '');
        setInvoiceType(transaction.invoiceType || 'B');
        setCuitComprador(transaction.cuitComprador || '');
        setCuitVendedor(transaction.cuitVendedor || '');
        setRelatedJobId(transaction.relatedJobId || '');
        setNotes(transaction.notes);
      }
    }
  }, [id, transactions, isEditing]);

  // Actualizar categoría cuando cambia el tipo
  useEffect(() => {
    if (!isEditing) {
      setCategory(type === 'income' ? 'services' : 'purchases');
    }
  }, [type, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError('');

    if (!description.trim()) {
      setError('La descripción es obligatoria');
      return;
    }
    if (!amount || amountNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }
    if (!date) {
      setError('La fecha es obligatoria');
      return;
    }

    const formData: TransactionFormData = {
      type,
      category: category as any,
      description: description.trim(),
      amount: amountNum,
      ivaRate,
      date,
      paymentMethod: paymentMethod as any,
      relatedClientId: relatedClientId || undefined,
      relatedSupplierId: relatedSupplierId || undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      invoiceType: invoiceType || undefined,
      cuitComprador: cuitComprador.trim() || undefined,
      cuitVendedor: cuitVendedor.trim() || undefined,
      relatedJobId: relatedJobId || undefined,
      notes: notes.trim(),
    };

    setIsSaving(true);
    try {
      if (isEditing && id) {
        await onUpdate(id, formData);
      } else {
        await onSave(formData, user?.id || user?.name || 'admin');
      }
      navigate('/finance');
    } catch {
      setError('Error al guardar la transacción. Revisá la conexión y probá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  if (!canManageTransaction) {
    return <Navigate to="/finance" replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4 overflow-x-clip p-3 pb-24 sm:space-y-6 sm:p-4 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/finance')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">
          {isEditing ? 'Editar' : 'Nuevo'} {type === 'income' ? 'Ingreso' : 'Gasto'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de transacción */}
        {!isEditing && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Tipo de Transacción</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`
                    p-4 rounded-lg border-2 text-center transition-all
                    ${type === 'income' 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                      : 'border-slate-200 hover:border-slate-300'
                    }
                  `}
                >
                  <TrendingUp className="w-8 h-8 mx-auto mb-2" />
                  <span className="font-semibold">Ingreso</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`
                    p-4 rounded-lg border-2 text-center transition-all
                    ${type === 'expense' 
                      ? 'border-red-500 bg-red-50 text-red-700' 
                      : 'border-slate-200 hover:border-slate-300'
                    }
                  `}
                >
                  <TrendingDown className="w-8 h-8 mx-auto mb-2" />
                  <span className="font-semibold">Gasto</span>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Información principal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-600" />
                Información Principal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Descripción *</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={type === 'income' ? 'Ej: Instalación aire acondicionado' : 'Ej: Compra de materiales'}
                />
              </div>

              <div>
                <Label>Categoría</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Fecha</Label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Método de Pago</Label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Notas adicionales</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Información adicional..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Monto e IVA */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-sky-600" />
                Monto e IVA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Monto (sin IVA) *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <Label>Tasa de IVA</Label>
                <select
                  value={ivaRate}
                  onChange={(e) => setIvaRate(parseFloat(e.target.value))}
                  className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                >
                  {IVA_RATES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Resumen de cálculo */}
              <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal:</span>
                  <span>{formatCurrency(amountNum)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IVA ({ivaRate}%):</span>
                  <span>{formatCurrency(ivaAmount)}</span>
                </div>
                <hr />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total:</span>
                  <span className={type === 'income' ? 'text-emerald-600' : 'text-red-600'}>
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Factura y Relación */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-sky-600" />
              Factura y Relación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>CUIT Comprador</Label>
                <Input
                  value={cuitComprador}
                  onChange={(e) => setCuitComprador(e.target.value)}
                  placeholder="Ej: 20-12345678-9"
                />
              </div>
              <div>
                <Label>CUIT Vendedor</Label>
                <Input
                  value={cuitVendedor}
                  onChange={(e) => setCuitVendedor(e.target.value)}
                  placeholder="Ej: 20-12345678-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Factura</Label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value)}
                  className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                >
                  {INVOICE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Número de Factura</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="0001-00000001"
                />
              </div>
            </div>

            {type === 'income' && (
              <div>
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Cliente relacionado (opcional)
                </Label>
                <select
                  value={relatedClientId}
                  onChange={(e) => setRelatedClientId(e.target.value)}
                  className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                >
                  <option value="">Sin cliente relacionado</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type === 'expense' && (
              <div>
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Proveedor relacionado (opcional)
                </Label>
                <select
                  value={relatedSupplierId}
                  onChange={(e) => setRelatedSupplierId(e.target.value)}
                  className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                >
                  <option value="">Sin proveedor relacionado</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.companyName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Trabajo relacionado */}
            <div>
              <Label className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Trabajo relacionado (opcional)
              </Label>
              {jobIdFromUrl && !isEditing ? (
                <div className="p-2 border rounded-lg bg-sky-50 text-sky-800 text-sm">
                  {(() => {
                    const j = jobs.find(j => j.id === jobIdFromUrl);
                    return j ? `${j.jobNumber} - ${j.title} (${j.clientName})` : `Trabajo #${jobIdFromUrl}`;
                  })()}
                </div>
              ) : (
                <select
                  value={relatedJobId}
                  onChange={(e) => setRelatedJobId(e.target.value)}
                  className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                >
                  <option value="">Sin trabajo relacionado</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.jobNumber} - {j.title} ({j.clientName})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Buttons */}
        <div className="flex gap-4">
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => navigate('/finance')}>
            Cancelar
          </Button>
          <Button 
            type="submit" 
            disabled={isSaving}
            className={type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : `Registrar ${type === 'income' ? 'Ingreso' : 'Gasto'}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
