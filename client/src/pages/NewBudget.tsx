import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileDown,
  Save,
  DollarSign,
  User,
  Package,
  MapPin,
  Share2,
  Percent,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { generateBudgetPdf } from '@/lib/generateBudgetPdf';
import { trpc } from '@/lib/trpc';
import type { Job, JobProduct, JobCurrency } from '@/types/job';
import { todayStr, addDaysLocal } from '@/lib/dateUtils';
import { buildBudgetProducts, getFallbackBudgetNumber, validateBudgetBeforeSave } from '@/lib/budgetUtils';
import {
  JOB_IVA_RATES,
  CURRENCY_OPTIONS,
  formatCurrency,
  getCurrencySymbol,
  generateJobNumber,
} from '@/types/job';
import { useAuth } from '@/contexts/AuthContext';

interface BudgetItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface NewBudgetProps {
  customers: { id: string; firstName: string; lastName: string; phone: string; cuit?: string; address?: string }[];
  products: { id: string; name: string; salePrice: number }[];
  jobs?: Job[];
  onSave: (data: any, clientName: string, clientPhone: string, clientCuit: string, technicianNames: string[], createdBy: string, createdByName: string) => string | Promise<string>;
  onUpdate?: (id: string, data: any, clientName: string, clientPhone: string, clientCuit: string, technicianNames: string[]) => void;
  currentUser: { id: string; name: string };
}

// Budget template defaults (loaded from localStorage)
function getBudgetDefaults() {
  try {
    const stored = localStorage.getItem('ingem_budget_defaults');
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    paymentTerms: 'A convenir.',
    warranty: 'Garantía de 6 meses sobre la mano de obra.',
    conditions: 'Presupuesto válido por 15 días corridos desde la fecha de emisión.\nLos trabajos se realizarán una vez aprobado el presupuesto y recibida la Orden de Compra.\nLos plazos de ejecución se confirmarán al momento de la aprobación.',
  };
}

export function NewBudget({ customers, products, jobs = [], onSave, onUpdate, currentUser }: NewBudgetProps) {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { canCreateEntity, canEditEntity } = useAuth();
  const canManageBudget = editId ? canEditEntity('jobs') : canCreateEntity('jobs');

  // Edit mode: load existing budget
  const editingJob = useMemo(() => {
    if (!editId) return null;
    return jobs.find(j => j.id === editId) || null;
  }, [editId, jobs]);

  const isEditMode = Boolean(editId);

  // Fetch next correlative budget number from backend (only for new)
  const { data: nextBudgetNumber } = trpc.jobs.nextBudgetNumber.useQuery(undefined, { enabled: !isEditMode });

  // Load defaults
  const defaults = useMemo(() => getBudgetDefaults(), []);

  // Form state
  const [clientId, setClientId] = useState(isEditMode ? '' : searchParams.get('clientId') || '');
  const [manualClientName, setManualClientName] = useState('');
  const [manualClientPhone, setManualClientPhone] = useState('');
  const [manualClientCuit, setManualClientCuit] = useState('');
  const [useManualClient, setUseManualClient] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<JobCurrency>('ARS');
  const [ivaRate, setIvaRate] = useState(21);
  const [validityDays, setValidityDays] = useState(15);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<BudgetItem[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [laborCost, setLaborCost] = useState(0);
  const [saving, setSaving] = useState(false);

  // New fields
  const [worksite, setWorksite] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState(defaults.paymentTerms);
  const [deliveryTerm, setDeliveryTerm] = useState('');
  const [warranty, setWarranty] = useState(defaults.warranty);
  const [conditions, setConditions] = useState(defaults.conditions);

  // Load edit data
  useEffect(() => {
    if (!editingJob) return;
    setTitle(editingJob.title);
    setDescription(editingJob.description);
    setCurrency(editingJob.currency);
    setIvaRate(editingJob.ivaRate);
    setNotes(editingJob.notes);
    setLaborCost(editingJob.laborCost);
    setWorksite(editingJob.budgetWorksite || '');
    setDiscountType(editingJob.budgetDiscountType || 'percent');
    setDiscountValue(editingJob.budgetDiscountValue || 0);
    setPaymentTerms(editingJob.budgetPaymentTerms || defaults.paymentTerms);
    setDeliveryTerm(editingJob.budgetDeliveryTerm || '');
    setWarranty(editingJob.budgetWarranty || defaults.warranty);
    setConditions(editingJob.budgetConditions || defaults.conditions);

    // Load client
    if (editingJob.clientId) {
      setClientId(editingJob.clientId);
      setUseManualClient(false);
    } else {
      setManualClientName(editingJob.clientName);
      setManualClientPhone(editingJob.clientPhone);
      setManualClientCuit(editingJob.clientCuit);
      setUseManualClient(true);
    }

    // Load items from productsUsed
    if (editingJob.productsUsed && editingJob.productsUsed.length > 0) {
      setItems(editingJob.productsUsed.map(p => ({
        id: crypto.randomUUID(),
        description: p.productName,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
      })));
    }

    // Calculate validity from dueDate
    if (editingJob.dueDate && editingJob.budgetDate) {
      const due = new Date(editingJob.dueDate);
      const start = new Date(editingJob.budgetDate);
      const diff = Math.round((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0) setValidityDays(diff);
    }
  }, [editingJob]);

  // Derived
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === clientId),
    [customers, clientId]
  );

  // Auto-fill worksite from customer address
  useEffect(() => {
    if (!isEditMode && selectedCustomer?.address && !worksite) {
      setWorksite(selectedCustomer.address);
    }
  }, [selectedCustomer, isEditMode]);

  const clientName = useManualClient
    ? manualClientName
    : selectedCustomer
      ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim()
      : '';
  const clientPhone = useManualClient ? manualClientPhone : selectedCustomer?.phone || '';
  const clientCuit = useManualClient ? manualClientCuit : selectedCustomer?.cuit || '';

  const itemsSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  );

  const grossSubtotal = itemsSubtotal + laborCost;

  // Apply discount
  const discountAmount = useMemo(() => {
    if (discountValue <= 0) return 0;
    if (discountType === 'percent') return (grossSubtotal * discountValue) / 100;
    return discountValue;
  }, [grossSubtotal, discountType, discountValue]);

  const subtotal = grossSubtotal - discountAmount;
  const ivaAmount = (subtotal * ivaRate) / 100;
  const total = subtotal + ivaAmount;

  // Handlers
  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof BudgetItem, value: string | number) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const addProductAsItem = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        description: product.name,
        quantity: 1,
        unitPrice: product.salePrice,
      },
    ]);
  };

  const buildJobForPdf = (id: string, budgetNumber: string, startDate: string, productsUsed: JobProduct[]): Job => ({
    id,
    jobNumber: editingJob?.jobNumber || '',
    clientId: useManualClient ? '' : clientId,
    clientName,
    clientPhone,
    clientCuit,
    status: 'pending',
    title,
    description,
    details: '',
    startDate,
    dueDate: (() => {
      const due = new Date(startDate);
      due.setDate(due.getDate() + validityDays);
      return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    })(),
    budgetStatus: 'pending',
    budgetNumber,
    budgetAmount: total,
    budgetDate: startDate,
    budgetWorksite: worksite || undefined,
    budgetDiscountType: discountValue > 0 ? discountType : undefined,
    budgetDiscountValue: discountValue > 0 ? discountValue : undefined,
    budgetPaymentTerms: paymentTerms || undefined,
    budgetDeliveryTerm: deliveryTerm || undefined,
    budgetWarranty: warranty || undefined,
    budgetConditions: conditions || undefined,
    hasPurchaseOrder: false,
    purchaseOrderNumber: '',
    needsInvoice: false,
    invoiceType: 'presupuesto',
    invoiceNumber: '',
    isConsumerFinal: false,
    currency,
    laborCost,
    materialsCost: itemsSubtotal,
    otherCosts: 0,
    ivaRate,
    subtotal,
    ivaAmount,
    totalAmount: total,
    balanceDue: total,
    amountPaid: 0,
    productsUsed,
    technicianIds: [],
    technicianNames: [],
    notes: notes || '',
    invoiceNotes: '',
    createdBy: currentUser.id,
    createdByName: currentUser.name,
    createdAt: startDate,
    updatedAt: startDate,
  });

  const handleSave = async (downloadPdf: boolean = true) => {
    const validationError = validateBudgetBeforeSave({ title, clientName, grossSubtotal });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);

    try {
      const budgetNumber = getFallbackBudgetNumber(
        isEditMode ? undefined : nextBudgetNumber,
        isEditMode ? editingJob!.budgetNumber : undefined
      );
      const jobNumber = isEditMode ? editingJob!.jobNumber : generateJobNumber();
      const startDate = isEditMode
        ? (editingJob!.startDate || todayStr())
        : todayStr();

      // Build productsUsed from items
      const productsUsed = buildBudgetProducts(items);

      const formData = {
        jobNumber,
        clientId: useManualClient ? '' : clientId,
        status: 'pending' as const,
        currency,
        title,
        description,
        details: '',
        startDate,
        budgetStatus: 'pending' as const,
        budgetNumber,
        budgetAmount: total,
        budgetDate: isEditMode ? (editingJob!.budgetDate || startDate) : startDate,
        budgetWorksite: worksite || undefined,
        budgetDiscountType: discountValue > 0 ? discountType : undefined,
        budgetDiscountValue: discountValue > 0 ? discountValue : undefined,
        budgetPaymentTerms: paymentTerms || undefined,
        budgetDeliveryTerm: deliveryTerm || undefined,
        budgetWarranty: warranty || undefined,
        budgetConditions: conditions || undefined,
        hasPurchaseOrder: editingJob?.hasPurchaseOrder ?? false,
        needsInvoice: false,
        invoiceType: 'presupuesto' as const,
        isConsumerFinal: false,
        laborCost,
        materialsCost: itemsSubtotal,
        otherCosts: 0,
        ivaRate,
        productsUsed,
        technicianIds: editingJob?.technicianIds ?? ([] as string[]),
        notes: notes || '',
        invoiceNotes: '',
        dueDate: addDaysLocal(isEditMode ? (editingJob!.budgetDate || startDate) : startDate, validityDays),
      };

      let savedId: string;

      if (isEditMode && onUpdate) {
        await onUpdate(editId!, formData, clientName, clientPhone, clientCuit, editingJob!.technicianNames);
        savedId = editId!;
      } else {
        savedId = await onSave(
          formData,
          clientName,
          clientPhone,
          clientCuit,
          [],
          currentUser.id,
          currentUser.name
        );
      }

      // Generate PDF
      if (downloadPdf) {
        const jobForPdf = buildJobForPdf(savedId, budgetNumber, formData.budgetDate!, productsUsed);
        await generateBudgetPdf(jobForPdf);
        toast.success(isEditMode ? 'Presupuesto actualizado y PDF descargado' : 'Presupuesto guardado y PDF descargado');
      } else {
        toast.success(isEditMode ? 'Presupuesto actualizado exitosamente' : 'Presupuesto guardado exitosamente');
      }

      navigate('/presupuestos');
    } catch (error) {
      console.error('Error saving budget:', error);
      toast.error('Error al guardar el presupuesto');
    } finally {
      setSaving(false);
    }
  };

    const handleSharePdf = async () => {
    const validationError = validateBudgetBeforeSave({ title, clientName, grossSubtotal });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      // First save if not in edit mode or if needed
      let savedId = editId || '';
      const budgetNumber = getFallbackBudgetNumber(
        isEditMode ? undefined : nextBudgetNumber,
        isEditMode ? editingJob!.budgetNumber : undefined
      );
      const startDate = isEditMode
        ? (editingJob!.startDate || todayStr())
        : todayStr();
      const productsUsed = buildBudgetProducts(items);

      const jobForPdf = buildJobForPdf(savedId, budgetNumber, startDate, productsUsed);

      // Generate PDF as blob
      const { jsPDF } = await import('jspdf');
      // Use the existing function but we need the blob - call generateBudgetPdf which saves directly
      // Instead, we'll generate and get the blob from jsPDF
      const pdfBlob = await generateBudgetPdfBlob(jobForPdf);
      const fileName = `Presupuesto_${budgetNumber}_${clientName.replace(/\s+/g, '_')}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

      // Try Web Share API
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Presupuesto ${budgetNumber}`,
          text: `Presupuesto ${budgetNumber} - ${title}`,
          files: [file],
        });
        toast.success('PDF compartido exitosamente');
      } else {
        // Fallback: download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('PDF descargado (compartir no soportado en este navegador)');
      }

      // Ask to mark as sent
      const markSent = window.confirm('¿Marcar presupuesto como "Enviado"?');
      if (markSent && isEditMode && onUpdate) {
        const todayDate = todayStr();
        const formData = {
          jobNumber: editingJob!.jobNumber,
          clientId: useManualClient ? '' : clientId,
          status: 'pending' as const,
          currency,
          title,
          description,
          details: '',
          startDate: editingJob!.startDate,
          budgetStatus: 'pending' as const,
          budgetNumber,
          budgetAmount: total,
          budgetDate: editingJob!.budgetDate || startDate,
          budgetSentDate: todayDate,
          budgetWorksite: worksite || undefined,
          budgetDiscountType: discountValue > 0 ? discountType : undefined,
          budgetDiscountValue: discountValue > 0 ? discountValue : undefined,
          budgetPaymentTerms: paymentTerms || undefined,
          budgetDeliveryTerm: deliveryTerm || undefined,
          budgetWarranty: warranty || undefined,
          budgetConditions: conditions || undefined,
          hasPurchaseOrder: editingJob!.hasPurchaseOrder,
          needsInvoice: false,
          invoiceType: 'presupuesto' as const,
          isConsumerFinal: false,
          laborCost,
          materialsCost: itemsSubtotal,
          otherCosts: 0,
          ivaRate,
          productsUsed,
          technicianIds: editingJob!.technicianIds,
          notes: notes || '',
          invoiceNotes: '',
          dueDate: editingJob!.dueDate,
        };
        await onUpdate(editId!, formData, clientName, clientPhone, clientCuit, editingJob!.technicianNames);
        toast.success('Marcado como enviado');
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Error sharing PDF:', error);
        toast.error('Error al compartir el PDF');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!canManageBudget || (editId && !editingJob)) {
    return <Navigate to="/presupuestos" replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl overflow-x-clip p-2 pb-48 sm:p-4 md:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/presupuestos')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">
            {isEditMode ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
          </h1>
          {(isEditMode ? editingJob?.budgetNumber : nextBudgetNumber) && (
            <p className="text-sm text-slate-500 mt-1">N° {isEditMode ? editingJob?.budgetNumber : nextBudgetNumber}</p>
          )}
        </div>
      </div>

      {/* Client Section */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 mb-2 sm:flex sm:items-center sm:gap-3">
            <Button
              type="button"
              variant={!useManualClient ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseManualClient(false)}
            >
              Cliente existente
            </Button>
            <Button
              type="button"
              variant={useManualClient ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseManualClient(true)}
            >
              Cargar manualmente
            </Button>
          </div>

          {!useManualClient ? (
            <div>
              <Label>Seleccionar cliente</Label>
              <select
                className="w-full mt-1 min-h-11 border rounded-md px-3 py-2 text-base sm:text-sm bg-white"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Seleccionar cliente...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} {c.phone ? `- ${c.phone}` : ''}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <p className="text-xs text-slate-500 mt-1">
                  CUIT: {selectedCustomer.cuit || 'No registrado'} | Tel: {selectedCustomer.phone || 'No registrado'}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Nombre / Razón Social *</Label>
                <Input
                  value={manualClientName}
                  onChange={(e) => setManualClientName(e.target.value)}
                  placeholder="Ej: EMPRESA S.A."
                />
              </div>
              <div>
                <Label>CUIT</Label>
                <Input
                  value={manualClientCuit}
                  onChange={(e) => setManualClientCuit(e.target.value)}
                  placeholder="30-12345678-9"
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={manualClientPhone}
                  onChange={(e) => setManualClientPhone(e.target.value)}
                  placeholder="11 1234-5678"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lugar de obra */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-purple-600" />
            Lugar de Obra
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={worksite}
            onChange={(e) => setWorksite(e.target.value)}
            placeholder="Dirección del lugar de obra..."
          />
          <p className="text-xs text-slate-400 mt-1">Se autocompleta con la dirección del cliente. Podés editarlo.</p>
        </CardContent>
      </Card>

      {/* Work Description */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-600" />
            Descripción del Trabajo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Título del Presupuesto *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Instalación aire acondicionado Split 3000 frigorías"
            />
          </div>
          <div>
            <Label>Descripción / Detalle</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción detallada del trabajo a realizar..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              Ítems del Presupuesto
            </CardTitle>
            <div className="flex w-full gap-2 sm:w-auto">
              {products.length > 0 && (
                <select
                  className="min-w-0 flex-1 min-h-11 border rounded px-2 py-1 bg-white text-base sm:min-w-[220px] sm:text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addProductAsItem(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">+ Agregar producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({getCurrencySymbol(currency)} {p.salePrice.toLocaleString('es-AR')})
                    </option>
                  ))}
                </select>
              )}
              <Button type="button" variant="outline" size="sm" className="min-h-11 flex-shrink-0" onClick={addItem}>
                <Plus className="w-3 h-3 mr-1" /> Ítem
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_80px_120px_120px_40px] gap-2 mb-2 text-xs font-medium text-slate-500 px-1">
            <span>Descripción</span>
            <span className="text-center">Cant.</span>
            <span className="text-right">Precio Unit.</span>
            <span className="text-right">Subtotal</span>
            <span></span>
          </div>

          {/* Items */}
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_80px_120px_120px_40px] gap-2 p-2 md:p-1 bg-slate-50 rounded-lg md:bg-transparent md:rounded-none border md:border-0"
              >
                <div>
                  <Label className="md:hidden text-xs text-slate-500">Descripción</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder={`Ítem ${index + 1}`}
                    className="text-base sm:text-sm"
                  />
                </div>
                <div>
                  <Label className="md:hidden text-xs text-slate-500">Cantidad</Label>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 1)}
                    className="text-base sm:text-sm text-center"
                  />
                </div>
                <div>
                  <Label className="md:hidden text-xs text-slate-500">Precio Unitario</Label>
                  <Input
                    type="number"
                    min={0}
                    value={item.unitPrice || ''}
                    onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="text-base sm:text-sm text-right"
                  />
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-sm font-medium text-slate-700">
                    {getCurrencySymbol(currency)} {(item.quantity * item.unitPrice).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 touch-manipulation p-0 text-red-400 hover:text-red-600 sm:h-8 sm:w-8"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Labor cost */}
          <div className="mt-4 pt-3 border-t">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_80px_120px_120px_40px] gap-2 items-center">
              <span className="text-sm font-medium text-slate-600">Mano de Obra</span>
              <span></span>
              <span></span>
              <Input
                type="number"
                min={0}
                value={laborCost || ''}
                onChange={(e) => setLaborCost(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="text-base sm:text-sm text-right"
              />
              <span></span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discount */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4 text-red-500" />
            Descuento Global
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={discountType === 'percent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDiscountType('percent')}
              >
                %
              </Button>
              <Button
                type="button"
                variant={discountType === 'fixed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDiscountType('fixed')}
              >
                {getCurrencySymbol(currency)} Fijo
              </Button>
            </div>
            <Input
              type="number"
              min={0}
              max={discountType === 'percent' ? 100 : undefined}
              value={discountValue || ''}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-28 text-base sm:text-sm"
            />
            {discountAmount > 0 && (
              <span className="text-sm text-red-600 font-medium">
                -{formatCurrency(discountAmount, currency)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-600" />
            Condiciones Comerciales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Forma de Pago</Label>
              <Textarea
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ej: 50% anticipo, 50% contra entrega"
                rows={2}
              />
            </div>
            <div>
              <Label>Plazo de Entrega</Label>
              <Input
                value={deliveryTerm}
                onChange={(e) => setDeliveryTerm(e.target.value)}
                placeholder="Ej: 10 días hábiles"
              />
            </div>
          </div>
          <div>
            <Label>Garantía</Label>
            <Input
              value={warranty}
              onChange={(e) => setWarranty(e.target.value)}
              placeholder="Ej: 6 meses sobre mano de obra"
            />
          </div>
          <div>
            <Label>Condiciones Generales (se imprimen al pie del PDF)</Label>
            <Textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="Condiciones generales del presupuesto..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Totals & Config */}
      <Card className="mb-4">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Config */}
            <div className="space-y-3">
              <div>
                <Label>Divisa</Label>
                <div className="flex gap-2 mt-1">
                  {CURRENCY_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={currency === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrency(opt.value)}
                    >
                      {opt.symbol} {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Tasa de IVA</Label>
                <select
                  className="w-full mt-1 min-h-11 border rounded-md px-3 py-2 text-base sm:text-sm bg-white"
                  value={ivaRate}
                  onChange={(e) => setIvaRate(parseFloat(e.target.value))}
                >
                  {JOB_IVA_RATES.map((rate) => (
                    <option key={rate.value} value={rate.value}>
                      {rate.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Validez (días)</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={validityDays}
                  onChange={(e) => setValidityDays(parseInt(e.target.value) || 15)}
                  className="w-24"
                />
              </div>
              <div>
                <Label>Notas internas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas internas (no aparecen en el PDF)..."
                  rows={2}
                />
              </div>
            </div>

            {/* Totals */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Materiales / Ítems:</span>
                <span>{formatCurrency(itemsSubtotal, currency)}</span>
              </div>
              {laborCost > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Mano de Obra:</span>
                  <span>{formatCurrency(laborCost, currency)}</span>
                </div>
              )}
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Descuento ({discountType === 'percent' ? `${discountValue}%` : 'fijo'}):</span>
                  <span>-{formatCurrency(discountAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal:</span>
                <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
              </div>
              {ivaRate > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>IVA ({ivaRate}%):</span>
                  <span>{formatCurrency(ivaAmount, currency)}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between text-lg font-bold text-slate-800">
                  <span>TOTAL:</span>
                  <span className="text-blue-700">{formatCurrency(total, currency)}</span>
                </div>
              </div>
              {currency === 'USD' && (
                <p className="text-xs text-amber-700 mt-2 bg-amber-50 p-2 rounded">
                  Precio sujeto a la cotización del Dólar Banco Nación venta billete al momento del pago.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 grid grid-cols-2 gap-2 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:static lg:flex lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <Button variant="outline" className="min-h-11 text-xs sm:text-sm" onClick={() => navigate('/presupuestos')} disabled={saving}>
          Cancelar
        </Button>
        {isEditMode && (
          <Button
            variant="outline"
            className="min-h-11 text-xs sm:text-sm text-green-600 border-green-200 hover:bg-green-50"
            onClick={handleSharePdf}
            disabled={saving}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Compartir PDF
          </Button>
        )}
        <Button
          variant="outline"
          className="min-h-11 text-xs sm:text-sm text-blue-600 border-blue-200 hover:bg-blue-50"
          onClick={() => handleSave(false)}
          disabled={saving}
        >
          <Save className="w-4 h-4 mr-2" />
          Solo Guardar
        </Button>
        <Button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="min-h-11 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700"
        >
          <FileDown className="w-4 h-4 mr-2" />
          {saving ? 'Guardando...' : (isEditMode ? 'Actualizar y Descargar PDF' : 'Guardar y Descargar PDF')}
        </Button>
      </div>
    </div>
  );
}

// Helper: generate PDF as Blob (for sharing)
async function generateBudgetPdfBlob(job: Job): Promise<Blob> {
  // We reuse the same logic from generateBudgetPdf but return blob instead of saving
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const COMPANY = {
    name: 'INGEM',
    subtitle: 'Especialistas en Termomecánica',
    cuit: '23-37374776-9',
    phone: '11 5467-3062',
    address: 'Calle 30 N° 2003, Guernica',
    province: 'Buenos Aires, Argentina',
    email: 'ingemaireacondicionado@gmail.com',
    logo: 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663032558987/CefAnGWPofMsrtoX.jpg',
  };

  function fmtCurrency(amount: number, currency: string): string {
    const symbol = currency === 'USD' ? 'US$' : '$';
    return `${symbol} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function fmtDate(dateStr?: string): string {
    if (!dateStr) return new Date().toLocaleDateString('es-AR');
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Load logo
  let logoBase64: string | null = null;
  try {
    const response = await fetch(COMPANY.logo);
    const blob = await response.blob();
    logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {}

  // Header
  if (logoBase64) doc.addImage(logoBase64, 'JPEG', margin, y, 25, 25);
  const headerX = margin + 30;
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95);
  doc.text(COMPANY.name, headerX, y + 8);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text(COMPANY.subtitle, headerX, y + 14);
  doc.text(`CUIT: ${COMPANY.cuit}`, headerX, y + 19);
  doc.text(`Tel: ${COMPANY.phone} | ${COMPANY.email}`, headerX, y + 24);

  const budgetNumber = job.budgetNumber || `PR-${job.jobNumber}`;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95);
  doc.text('PRESUPUESTO', pageWidth - margin, y + 6, { align: 'right' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
  doc.text(`N°: ${budgetNumber}`, pageWidth - margin, y + 12, { align: 'right' });
  doc.text(`Fecha: ${fmtDate(job.budgetDate || job.startDate)}`, pageWidth - margin, y + 17, { align: 'right' });
  if (job.dueDate) doc.text(`Válido hasta: ${fmtDate(job.dueDate)}`, pageWidth - margin, y + 22, { align: 'right' });
  y += 32;

  doc.setDrawColor(30, 58, 95); doc.setLineWidth(0.5); doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Client info
  doc.setFillColor(245, 247, 250); doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95);
  doc.text('DATOS DEL CLIENTE', margin + 5, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(10);
  doc.text(`Cliente: ${job.clientName}`, margin + 5, y + 13);
  if (job.clientCuit) doc.text(`CUIT: ${job.clientCuit}`, margin + 5, y + 19);
  if (job.clientPhone) doc.text(`Teléfono: ${job.clientPhone}`, margin + 5, y + 25);
  if (job.budgetWorksite) doc.text(`Lugar de obra: ${job.budgetWorksite}`, pageWidth / 2, y + 13);
  y += 34;

  // Work description
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95);
  doc.text('DESCRIPCIÓN DEL TRABAJO', margin, y); y += 5;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40); doc.setFontSize(10);
  doc.text(job.title, margin, y); y += 5;
  if (job.description) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const descLines = doc.splitTextToSize(job.description, contentWidth);
    doc.text(descLines, margin, y); y += descLines.length * 4 + 2;
  }
  y += 4;

  // Items table
  const tableBody: (string | number)[][] = [];
  if (job.productsUsed && job.productsUsed.length > 0) {
    job.productsUsed.forEach((p) => {
      tableBody.push([p.productName, String(p.quantity), fmtCurrency(p.unitPrice, job.currency), fmtCurrency(p.totalPrice, job.currency)]);
    });
  }
  if (job.laborCost > 0) tableBody.push(['Mano de obra', '1', fmtCurrency(job.laborCost, job.currency), fmtCurrency(job.laborCost, job.currency)]);
  if (tableBody.length === 0) {
    const amount = job.budgetAmount || job.totalAmount;
    tableBody.push([job.title, '1', fmtCurrency(amount, job.currency), fmtCurrency(amount, job.currency)]);
  }

  autoTable(doc, {
    startY: y, head: [['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']], body: tableBody,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3, textColor: [40, 40, 40] },
    headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 20, halign: 'center' }, 2: { cellWidth: 35, halign: 'right' }, 3: { cellWidth: 35, halign: 'right' } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Totals
  const totalsX = pageWidth - margin - 70;
  const totalsWidth = 70;
  const productsTotal = job.productsUsed?.reduce((s, p) => s + p.totalPrice, 0) || 0;
  const materialsOrProducts = productsTotal > 0 ? productsTotal : job.materialsCost;
  const grossSub = job.laborCost + materialsOrProducts + job.otherCosts;

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);

  if (job.budgetDiscountValue && job.budgetDiscountValue > 0) {
    doc.text('Subtotal bruto:', totalsX, y);
    doc.text(fmtCurrency(grossSub, job.currency), totalsX + totalsWidth, y, { align: 'right' }); y += 5;
    const discAmt = job.budgetDiscountType === 'percent' ? (grossSub * job.budgetDiscountValue) / 100 : job.budgetDiscountValue;
    doc.setTextColor(200, 50, 50);
    doc.text(`Descuento (${job.budgetDiscountType === 'percent' ? `${job.budgetDiscountValue}%` : 'fijo'}):`, totalsX, y);
    doc.text(`-${fmtCurrency(discAmt, job.currency)}`, totalsX + totalsWidth, y, { align: 'right' }); y += 5;
    doc.setTextColor(60, 60, 60);
    const netSub = grossSub - discAmt;
    doc.text('Subtotal:', totalsX, y);
    doc.text(fmtCurrency(netSub, job.currency), totalsX + totalsWidth, y, { align: 'right' }); y += 5;
  } else {
    doc.text('Subtotal:', totalsX, y);
    doc.text(fmtCurrency(grossSub, job.currency), totalsX + totalsWidth, y, { align: 'right' }); y += 5;
  }

  if (job.ivaRate > 0) {
    const netSub = job.budgetDiscountValue && job.budgetDiscountValue > 0
      ? grossSub - (job.budgetDiscountType === 'percent' ? (grossSub * job.budgetDiscountValue) / 100 : job.budgetDiscountValue)
      : grossSub;
    const iva = (netSub * job.ivaRate) / 100;
    doc.text(`IVA (${job.ivaRate}%):`, totalsX, y);
    doc.text(fmtCurrency(iva, job.currency), totalsX + totalsWidth, y, { align: 'right' }); y += 5;
  }

  doc.setDrawColor(30, 58, 95); doc.setLineWidth(0.3); doc.line(totalsX, y, totalsX + totalsWidth, y); y += 5;
  const totalAmt = job.budgetAmount || job.totalAmount;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95);
  doc.text('TOTAL:', totalsX, y);
  doc.text(fmtCurrency(totalAmt, job.currency), totalsX + totalsWidth, y, { align: 'right' }); y += 12;

  // Currency notice
  if (job.currency === 'USD') {
    doc.setFillColor(255, 250, 230); doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 90, 0);
    doc.text('Valores expresados en Dólares Estadounidenses (USD). Precio sujeto a la cotización del', margin + 3, y + 5);
    doc.text('Dólar Banco Nación venta billete al momento del pago.', margin + 3, y + 9); y += 16;
  } else {
    doc.setFillColor(255, 250, 230); doc.roundedRect(margin, y, contentWidth, 8, 2, 2, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 90, 0);
    doc.text('Precio sujeto a la cotización del Dólar Banco Nación venta billete al momento del pago.', margin + 3, y + 5); y += 12;
  }

  // Commercial terms
  const terms: string[] = [];
  if (job.budgetPaymentTerms) terms.push(`Forma de pago: ${job.budgetPaymentTerms}`);
  if (job.budgetDeliveryTerm) terms.push(`Plazo de entrega: ${job.budgetDeliveryTerm}`);
  if (job.budgetWarranty) terms.push(`Garantía: ${job.budgetWarranty}`);

  if (terms.length > 0 && y < 240) {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95);
    doc.text('CONDICIONES COMERCIALES', margin, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80); doc.setFontSize(8);
    terms.forEach((t) => { doc.text(`• ${t}`, margin, y); y += 4; });
    y += 2;
  }

  // General conditions
  if (job.budgetConditions && y < 255) {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95);
    doc.text('CONDICIONES GENERALES', margin, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80); doc.setFontSize(8);
    const condLines = job.budgetConditions.split('\n');
    condLines.forEach((line) => {
      if (line.trim()) { doc.text(`• ${line.trim()}`, margin, y); y += 4; }
    });
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
  doc.text(`${COMPANY.name} | CUIT: ${COMPANY.cuit} | ${COMPANY.address}, ${COMPANY.province} | Tel: ${COMPANY.phone}`, pageWidth / 2, footerY, { align: 'center' });

  return doc.output('blob');
}
