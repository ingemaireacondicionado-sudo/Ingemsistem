import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  FileText,
  DollarSign,
  Package,
  Receipt,
  Wrench,
  Plus,
  Trash2,
  Calculator,
  FileDown,
  CircleDollarSign,
} from 'lucide-react';
import type { Transaction } from '@/types/transaction';
import { formatCurrency as formatCurrencyTx } from '@/types/transaction';
import { generateBudgetPdf } from '@/lib/generateBudgetPdf';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PrivateFileUpload } from '@/components/PrivateFileUpload';
import type { Job, JobFormData, JobProduct, JobCurrency } from '@/types/job';
import { 
  JOB_STATUS,
  INVOICE_TYPE_OPTIONS,
  BUDGET_STATUS,
  JOB_IVA_RATES,
  CURRENCY_OPTIONS,
  formatCurrency,
  calculateJobTotals,
  generateJobNumber,
} from '@/types/job';
import { useAuth } from '@/contexts/AuthContext';

interface JobFormProps {
  jobs: Job[];
  customers: { id: string; firstName: string; lastName: string; phone: string; cuit?: string }[];
  technicians: { id: string; firstName: string; lastName: string; isActive: boolean }[];
  products: { id: string; name: string; salePrice: number }[];
  transactions?: Transaction[];
  onSave: (data: JobFormData, clientName: string, clientPhone: string, clientCuit: string, technicianNames: string[], createdBy: string, createdByName: string) => string | Promise<string>;
  onUpdate: (id: string, data: JobFormData, clientName: string, clientPhone: string, clientCuit: string, technicianNames: string[]) => void | Promise<void>;
}

const parseAmountInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
};

const parseOptionalAmountInput = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : undefined;
};

export function JobForm({ jobs, customers, technicians, products, transactions = [], onSave, onUpdate }: JobFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(id);
  const { user: authUser, canCreateEntity, canEditEntity } = useAuth();
  const canManageJob = isEditing ? canEditEntity('jobs') : canCreateEntity('jobs');

  // Basic info
  const [jobNumber, setJobNumber] = useState(generateJobNumber());
  const [clientId, setClientId] = useState(isEditing ? '' : searchParams.get('clientId') || '');
  const [status, setStatus] = useState<Job['status']>('pending');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [details, setDetails] = useState('');
  
  // Dates
  const [startDate, setStartDate] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  });
  const [endDate, setEndDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  // Budget
  const [budgetStatus, setBudgetStatus] = useState<Job['budgetStatus']>('not_needed');
  const [budgetNumber, setBudgetNumber] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetDate, setBudgetDate] = useState('');
  
  // Purchase Order
  const [hasPurchaseOrder, setHasPurchaseOrder] = useState(false);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [purchaseOrderDate, setPurchaseOrderDate] = useState('');
  const [purchaseOrderFileUrl, setPurchaseOrderFileUrl] = useState('');
  
  // Invoice
  const [needsInvoice, setNeedsInvoice] = useState(true);
  const [invoiceType, setInvoiceType] = useState<Job['invoiceType']>('B');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceFileUrl, setInvoiceFileUrl] = useState('');
  
  // Consumer Final
  const [isConsumerFinal, setIsConsumerFinal] = useState(false);
  const [consumerFinalName, setConsumerFinalName] = useState('');
  const [consumerFinalDni, setConsumerFinalDni] = useState('');
  const [consumerFinalAddress, setConsumerFinalAddress] = useState('');
  
  // Currency
  const [currency, setCurrency] = useState<JobCurrency>('ARS');
  
  // Costs
  const [laborCost, setLaborCost] = useState('');
  const [materialsCost, setMaterialsCost] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [ivaRate, setIvaRate] = useState(21);
  
  // Products
  const [productsUsed, setProductsUsed] = useState<JobProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductQty, setSelectedProductQty] = useState('1');
  
  // Technicians
  const [selectedTechnicians, setSelectedTechnicians] = useState<string[]>([]);
  
  // Notes
  const [notes, setNotes] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');

  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Calcular totales
  const laborCostNum = parseAmountInput(laborCost);
  const materialsCostNum = parseAmountInput(materialsCost);
  const otherCostsNum = parseAmountInput(otherCosts);
  const productsSubtotal = productsUsed.reduce((sum, p) => sum + p.totalPrice, 0);
  const { subtotal, ivaAmount, totalAmount } = calculateJobTotals(
    laborCostNum + productsSubtotal,
    materialsCostNum,
    otherCostsNum,
    ivaRate
  );

  useEffect(() => {
    if (isEditing && id) {
      const job = jobs.find(j => j.id === id);
      if (job) {
        setJobNumber(job.jobNumber);
        setClientId(job.clientId);
        setStatus(job.status);
        setTitle(job.title);
        setDescription(job.description);
        setDetails(job.details);
        setStartDate(job.startDate);
        setEndDate(job.endDate || '');
        setDueDate(job.dueDate || '');
        setBudgetStatus(job.budgetStatus);
        setBudgetNumber(job.budgetNumber || '');
        setBudgetAmount(job.budgetAmount?.toString() || '');
        setBudgetDate(job.budgetDate || '');
        setHasPurchaseOrder(job.hasPurchaseOrder);
        setPurchaseOrderNumber(job.purchaseOrderNumber || '');
        setPurchaseOrderDate(job.purchaseOrderDate || '');
        setPurchaseOrderFileUrl(job.purchaseOrderFileUrl || '');
        setNeedsInvoice(job.needsInvoice);
        setInvoiceType(job.invoiceType);
        setInvoiceNumber(job.invoiceNumber || '');
        setInvoiceDate(job.invoiceDate || '');
        setInvoiceFileUrl(job.invoiceFileUrl || '');
        setIsConsumerFinal(job.isConsumerFinal);
        setConsumerFinalName(job.consumerFinalName || '');
        setConsumerFinalDni(job.consumerFinalDni || '');
        setConsumerFinalAddress(job.consumerFinalAddress || '');
        setLaborCost(job.laborCost.toString());
        setMaterialsCost(job.materialsCost.toString());
        setOtherCosts(job.otherCosts.toString());
        setIvaRate(job.ivaRate);
        setCurrency(job.currency || 'ARS');
        setProductsUsed(job.productsUsed);
        setSelectedTechnicians(job.technicianIds);
        setNotes(job.notes);
        setInvoiceNotes(job.invoiceNotes);
      }
    }
  }, [id, jobs, isEditing]);

  // Actualizar nombre de consumidor final cuando cambia el cliente
  useEffect(() => {
    if (clientId && !isEditing) {
      const client = customers.find(c => c.id === clientId);
      if (client) {
        setConsumerFinalName(`${client.firstName} ${client.lastName}`);
      }
    }
  }, [clientId, customers, isEditing]);

  const handleAddProduct = () => {
    if (!selectedProductId || !selectedProductQty) return;
    
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;
    
    const qty = Number(selectedProductQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('La cantidad del producto debe ser un numero entero mayor a cero');
      return;
    }

    const totalPrice = product.salePrice * qty;
    
    setError('');
    setProductsUsed(prev => {
      const existingIndex = prev.findIndex(p => p.productId === product.id);
      if (existingIndex === -1) {
        return [...prev, {
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPrice: product.salePrice,
          totalPrice,
        }];
      }

      return prev.map((item, index) => {
        if (index !== existingIndex) return item;

        const nextQuantity = item.quantity + qty;
        return {
          ...item,
          quantity: nextQuantity,
          unitPrice: product.salePrice,
          totalPrice: product.salePrice * nextQuantity,
        };
      });
    });
    
    setSelectedProductId('');
    setSelectedProductQty('1');
  };

  const handleRemoveProduct = (index: number) => {
    setProductsUsed(prev => prev.filter((_, i) => i !== index));
  };

  const toggleTechnician = (techId: string) => {
    setSelectedTechnicians(prev =>
      prev.includes(techId)
        ? prev.filter(id => id !== techId)
        : [...prev, techId]
    );
  };

  // Fetch next correlative budget number from backend
  const { refetch: refetchBudgetNumber } = trpc.jobs.nextBudgetNumber.useQuery(undefined, { enabled: false });

  const handleGenerateBudgetNumber = async () => {
    try {
      const result = await refetchBudgetNumber();
      if (result.data) {
        setBudgetNumber(result.data);
      }
    } catch {
      toast.error('No se pudo generar el numero de presupuesto');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setError('');

    if (!clientId) {
      setError('Debes seleccionar un cliente');
      return;
    }
    if (!title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    if (endDate && startDate && endDate < startDate) {
      setError('La fecha de fin no puede ser anterior a la fecha de inicio');
      return;
    }
    if (dueDate && startDate && dueDate < startDate) {
      setError('La fecha comprometida no puede ser anterior a la fecha de inicio');
      return;
    }

    const client = customers.find(c => c.id === clientId);
    if (!client) {
      setError('Cliente no encontrado');
      return;
    }

    const technicianNames = selectedTechnicians
      .map(tid => {
        const tech = technicians.find(t => t.id === tid);
        return tech ? `${tech.firstName} ${tech.lastName}` : '';
      })
      .filter(Boolean);
    const parsedBudgetAmount = parseOptionalAmountInput(budgetAmount);

    const formData: JobFormData = {
      jobNumber,
      clientId,
      status,
      currency,
      title: title.trim(),
      description: description.trim(),
      details: details.trim(),
      startDate,
      endDate: endDate || undefined,
      dueDate: dueDate || undefined,
      budgetStatus,
      budgetNumber: budgetNumber.trim() || undefined,
      budgetAmount: parsedBudgetAmount,
      budgetDate: budgetDate || undefined,
      hasPurchaseOrder,
      purchaseOrderNumber: hasPurchaseOrder ? purchaseOrderNumber.trim() || undefined : undefined,
      purchaseOrderDate: hasPurchaseOrder ? purchaseOrderDate || undefined : undefined,
      purchaseOrderFileUrl: hasPurchaseOrder && purchaseOrderFileUrl ? purchaseOrderFileUrl : undefined,
      needsInvoice,
      invoiceType,
      invoiceNumber: invoiceNumber.trim() || undefined,
      invoiceDate: invoiceDate || undefined,
      invoiceFileUrl: invoiceFileUrl || undefined,
      isConsumerFinal,
      consumerFinalName: isConsumerFinal ? consumerFinalName.trim() || undefined : undefined,
      consumerFinalDni: isConsumerFinal ? consumerFinalDni.trim() || undefined : undefined,
      consumerFinalAddress: isConsumerFinal ? consumerFinalAddress.trim() || undefined : undefined,
      laborCost: laborCostNum,
      materialsCost: materialsCostNum,
      otherCosts: otherCostsNum,
      ivaRate,
      productsUsed,
      technicianIds: selectedTechnicians,
      notes: notes.trim(),
      invoiceNotes: invoiceNotes.trim(),
    };

    setIsSaving(true);
    try {
      if (isEditing && id) {
        await onUpdate(id, formData, `${client.firstName} ${client.lastName}`, client.phone, client.cuit || '', technicianNames);
      } else {
        await onSave(formData, `${client.firstName} ${client.lastName}`, client.phone, client.cuit || '', technicianNames, authUser?.id || 'admin', authUser?.name || 'Admin');
      }
      navigate('/jobs');
    } catch (err) {
      setError('Error al guardar el trabajo. Revisá la conexión y probá de nuevo.');
      setIsSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const activeTechnicians = technicians.filter(t => t.isActive);

  if (!canManageJob) {
    return <Navigate to="/jobs" replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 overflow-x-clip p-2 pb-36 sm:space-y-6 sm:p-4 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Button variant="outline" size="sm" className="h-11 touch-manipulation sm:h-10" onClick={() => navigate('/jobs')}>
          <ArrowLeft className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Volver</span>
        </Button>
        <h1 className="text-lg sm:text-2xl font-bold text-slate-800">
          {isEditing ? 'Editar Trabajo' : 'Nuevo Trabajo'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Información básica */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Información del Trabajo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Número de Trabajo</Label>
                <Input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  placeholder="TR-2402-001"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Estado</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Job['status'])}
                  className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                >
                  {Object.entries(JOB_STATUS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-sm">Cliente *</Label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
              >
                <option value="">Seleccionar cliente...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} - {c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-sm">Título del Trabajo *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Instalación Aire Acondicionado Split"
                className="h-11 sm:h-9 text-base sm:text-sm"
              />
            </div>

            <div>
              <Label className="text-sm">Descripción</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción del trabajo..."
                rows={2}
                className="text-base sm:text-sm"
              />
            </div>

            <div>
              <Label className="text-sm">Detalle Técnico</Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Detalles técnicos del trabajo realizado..."
                rows={3}
                className="text-base sm:text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Fecha de Inicio</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Fecha de Fin</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Fecha Comprometida</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Presupuesto */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Presupuesto
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div>
              <Label className="text-sm">Estado del Presupuesto</Label>
              <select
                value={budgetStatus}
                onChange={(e) => setBudgetStatus(e.target.value as Job['budgetStatus'])}
                className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
              >
                {Object.entries(BUDGET_STATUS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {isEditing && (
              <Button
                type="button"
                variant="outline"
                className="text-sky-600 border-sky-200 hover:bg-sky-50 h-11 sm:h-9 text-sm"
                onClick={() => {
                  const job = jobs.find(j => j.id === id);
                  if (job) {
                    generateBudgetPdf(job)
                      .then(() => toast.success('PDF de presupuesto generado'))
                      .catch(() => toast.error('Error al generar PDF'));
                  }
                }}
              >
                <FileDown className="w-4 h-4 mr-2" /> Descargar PDF
              </Button>
            )}

            {budgetStatus !== 'not_needed' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label className="text-sm">Número de Presupuesto</Label>
                  <div className="flex gap-2">
                    <Input
                      value={budgetNumber}
                      onChange={(e) => setBudgetNumber(e.target.value)}
                      placeholder="PR-2402-001"
                      className="h-11 sm:h-9 text-base sm:text-sm"
                    />
                    <Button type="button" variant="outline" className="h-11 sm:h-9 px-3 flex-shrink-0" onClick={handleGenerateBudgetNumber}>
                      Generar
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Monto</Label>
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    step="0.01"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-11 sm:h-9 text-base sm:text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm">Fecha</Label>
                  <Input
                    type="date"
                    value={budgetDate}
                    onChange={(e) => setBudgetDate(e.target.value)}
                    className="h-11 sm:h-9 text-base sm:text-sm"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Orden de Compra */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Orden de Compra
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={hasPurchaseOrder}
                onCheckedChange={setHasPurchaseOrder}
              />
              <Label className="cursor-pointer text-sm">Tiene orden de compra</Label>
            </div>

            {hasPurchaseOrder && (
              <div className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Label className="text-sm">Número de OC</Label>
                    <Input
                      value={purchaseOrderNumber}
                      onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                      placeholder="OC-2024-001"
                      className="h-11 sm:h-9 text-base sm:text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Fecha de OC</Label>
                    <Input
                      type="date"
                      value={purchaseOrderDate}
                      onChange={(e) => setPurchaseOrderDate(e.target.value)}
                      className="h-11 sm:h-9 text-base sm:text-sm"
                    />
                  </div>
                </div>
                <PrivateFileUpload
                  label="PDF de Orden de Compra"
                  currentFileUrl={purchaseOrderFileUrl || undefined}
                  onFileUploaded={(ref) => setPurchaseOrderFileUrl(ref)}
                  onFileRemoved={() => setPurchaseOrderFileUrl('')}
                  category="purchase_order"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Facturación */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Facturación
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={needsInvoice}
                onCheckedChange={setNeedsInvoice}
              />
              <Label className="cursor-pointer text-sm">Requiere factura</Label>
            </div>

            {needsInvoice && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Label className="text-sm">Tipo de Factura</Label>
                    <select
                      value={invoiceType}
                      onChange={(e) => setInvoiceType(e.target.value as Job['invoiceType'])}
                      className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                    >
                      {Object.entries(INVOICE_TYPE_OPTIONS).map(([key, { label, icon }]) => (
                        <option key={key} value={key}>{icon} {label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm">Número de Factura</Label>
                    <Input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="0001-00000001"
                      className="h-11 sm:h-9 text-base sm:text-sm"
                    />
                  </div>
                </div>

                {invoiceNumber && (
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <Label className="text-sm">Fecha de Factura</Label>
                      <Input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="h-11 sm:h-9 text-base sm:text-sm"
                      />
                    </div>
                    <PrivateFileUpload
                      label="PDF de Factura"
                      currentFileUrl={invoiceFileUrl || undefined}
                      onFileUploaded={(ref) => setInvoiceFileUrl(ref)}
                      onFileRemoved={() => setInvoiceFileUrl('')}
                      category="invoice"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Switch
                    checked={isConsumerFinal}
                    onCheckedChange={setIsConsumerFinal}
                  />
                  <Label className="cursor-pointer text-sm">Es consumidor final</Label>
                </div>

                {isConsumerFinal && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-sm">Nombre</Label>
                      <Input
                        value={consumerFinalName}
                        onChange={(e) => setConsumerFinalName(e.target.value)}
                        placeholder="Nombre completo"
                        className="h-11 sm:h-9 text-base sm:text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">DNI</Label>
                      <Input
                        value={consumerFinalDni}
                        onChange={(e) => setConsumerFinalDni(e.target.value)}
                        placeholder="XX.XXX.XXX"
                        className="h-11 sm:h-9 text-base sm:text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-sm">Dirección</Label>
                      <Input
                        value={consumerFinalAddress}
                        onChange={(e) => setConsumerFinalAddress(e.target.value)}
                        placeholder="Dirección completa"
                        className="h-11 sm:h-9 text-base sm:text-sm"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Costos */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Costos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            {/* Selector de Divisa */}
            <div>
              <Label className="text-sm">Divisa</Label>
              <div className="flex gap-2 mt-1">
                {CURRENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCurrency(opt.value)}
                    className={`
                      flex-1 p-2 sm:p-3 rounded-lg border text-center transition-all font-medium min-h-[44px]
                      ${currency === opt.value
                        ? 'bg-sky-50 border-sky-500 text-sky-700'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 active:bg-slate-50'
                      }
                    `}
                  >
                    <span className="text-base sm:text-lg font-bold">{opt.symbol}</span>
                    <span className="block text-xs mt-0.5">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <Label className="text-sm">Mano de Obra</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  step="0.01"
                  value={laborCost}
                  onChange={(e) => setLaborCost(e.target.value)}
                  placeholder="0.00"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Materiales</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  step="0.01"
                  value={materialsCost}
                  onChange={(e) => setMaterialsCost(e.target.value)}
                  placeholder="0.00"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
              <div>
                <Label className="text-sm">Otros Gastos</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  step="0.01"
                  value={otherCosts}
                  onChange={(e) => setOtherCosts(e.target.value)}
                  placeholder="0.00"
                  className="h-11 sm:h-9 text-base sm:text-sm"
                />
              </div>
            </div>

            {/* Productos usados */}
            <div>
              <Label className="text-sm">Productos Utilizados</Label>
              <div className="flex flex-col sm:flex-row gap-2 mt-1">
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="flex-1 h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
                >
                  <option value="">Seleccionar producto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {formatCurrency(p.salePrice)}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={selectedProductQty}
                    onChange={(e) => setSelectedProductQty(e.target.value)}
                    className="w-20 h-11 sm:h-9 text-base sm:text-sm"
                  />
                  <Button type="button" variant="outline" className="h-11 sm:h-9 min-w-[44px]" onClick={handleAddProduct}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {productsUsed.length > 0 && (
                <div className="mt-2 space-y-1">
                  {productsUsed.map((product, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span className="text-xs sm:text-sm truncate mr-2">
                        {product.productName} x{product.quantity} = {formatCurrency(product.totalPrice, currency)}
                      </span>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Quitar ${product.productName}`} className="h-11 w-11 sm:h-8 sm:w-8 flex-shrink-0 touch-manipulation" onClick={() => handleRemoveProduct(i)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm">Tasa de IVA</Label>
              <select
                value={ivaRate}
                onChange={(e) => setIvaRate(parseFloat(e.target.value))}
                className="w-full h-11 sm:h-9 px-3 border rounded-lg text-base sm:text-sm bg-white"
              >
                {JOB_IVA_RATES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Resumen */}
            <div className="bg-slate-50 p-3 sm:p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-slate-500">Subtotal:</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-slate-500">IVA ({ivaRate}%):</span>
                <span>{formatCurrency(ivaAmount, currency)}</span>
              </div>
              <hr />
              <div className="flex justify-between font-semibold text-base sm:text-lg">
                <span>Total:</span>
                <span className="text-sky-600">{formatCurrency(totalAmount, currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Técnicos */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Técnicos Asignados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {activeTechnicians.length === 0 ? (
                <p className="text-sm text-slate-500 italic sm:col-span-2 md:col-span-3">
                  No hay tecnicos activos para asignar.
                </p>
              ) : activeTechnicians.map((tech) => (
                <button
                  key={tech.id}
                  type="button"
                  onClick={() => toggleTechnician(tech.id)}
                  className={`
                    p-3 rounded-lg border text-left transition-all min-h-[48px] active:scale-[0.98]
                    ${selectedTechnicians.includes(tech.id)
                      ? 'bg-sky-50 border-sky-500'
                      : 'bg-white border-slate-200 hover:border-slate-300 active:bg-slate-50'
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0
                      ${selectedTechnicians.includes(tech.id) ? 'bg-sky-600' : 'bg-slate-400'}
                    `}>
                      {tech.firstName[0]}{tech.lastName[0]}
                    </div>
                    <span className="text-sm truncate">{tech.firstName} {tech.lastName}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Gastos imputados (solo en edición) */}
        {isEditing && id && (
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <CircleDollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                Gastos Imputados
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3">
              {(() => {
                const jobExpenses = transactions.filter(t => t.relatedJobId === id && t.type === 'expense');
                if (jobExpenses.length === 0) {
                  return (
                    <p className="text-sm text-slate-500 italic">No hay gastos imputados a este trabajo.</p>
                  );
                }
                const total = jobExpenses.reduce((sum, t) => sum + t.amount, 0);
                return (
                  <>
                    <div className="space-y-2">
                      {jobExpenses.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{t.description}</span>
                            <span className="text-slate-500 text-xs">{t.date}</span>
                          </div>
                          <span className="text-red-600 font-medium ml-2 whitespace-nowrap">
                            {formatCurrencyTx(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium text-slate-600">Total gastos:</span>
                      <span className="font-semibold text-red-600">{formatCurrencyTx(total)}</span>
                    </div>
                  </>
                );
              })()}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto h-10"
                onClick={() => navigate(`/finance/expense/new?jobId=${id}`)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar Gasto
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Notas */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
              Notas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-3 sm:space-y-4">
            <div>
              <Label className="text-sm">Notas Internas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas internas sobre el trabajo..."
                rows={3}
                className="text-base sm:text-sm"
              />
            </div>
            {needsInvoice && (
              <div>
                <Label className="text-sm">Notas para la Factura</Label>
                <Textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="Texto que aparecerá en la factura..."
                  rows={2}
                  className="text-base sm:text-sm"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Botones - fijos en móvil */}
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex gap-2 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:relative lg:inset-auto lg:z-auto lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <Button type="button" variant="outline" className="flex-1 sm:flex-none h-11 sm:h-10" onClick={() => navigate('/jobs')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving} className="flex-1 sm:flex-none bg-sky-600 hover:bg-sky-700 h-11 sm:h-10">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Trabajo'}
          </Button>
        </div>
      </form>
    </div>
  );
}
