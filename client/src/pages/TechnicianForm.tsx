import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  User,
  Phone,
  Mail,
  FileText,
  Shield,
  FileCheck,
  Upload,
  AlertTriangle,
  CheckCircle,
  File,
  Image,
  X,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Technician, TechnicianFormData, TechnicianFile } from '@/types/technician';
import { TECHNICIAN_SPECIALTIES, checkTechnicianDocumentation } from '@/types/technician';
import { useAuth } from '@/contexts/AuthContext';

interface TechnicianFormProps {
  technicians: Technician[];
  onSave: (data: TechnicianFormData) => string | Promise<string>;
  onUpdate: (id: string, data: TechnicianFormData) => void | Promise<void>;
}

// Función para convertir archivo a base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
};

// Función para obtener el tipo de archivo
const getFileType = (file: File): 'pdf' | 'image' | 'other' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  return 'other';
};

// Componente para subir archivos
function FileUploadSection({
  title,
  icon: Icon,
  files,
  onFilesChange,
  hasDocument,
}: {
  title: string;
  icon: React.ElementType;
  files: TechnicianFile[];
  onFilesChange: (files: TechnicianFile[]) => void;
  hasDocument: boolean;
}) {
  const [previewFile, setPreviewFile] = useState<TechnicianFile | null>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    const newFiles: TechnicianFile[] = [];
    for (const file of Array.from(uploadedFiles)) {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        toast.error(`Formato no permitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`El archivo ${file.name} supera los 5 MB`);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        newFiles.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: getFileType(file),
          url: base64,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
      } catch {
        toast.error(`No se pudo subir ${file.name}`);
      }
    }
    onFilesChange([...files, ...newFiles]);
    e.target.value = '';
  };

  const handleRemoveFile = (fileId: string) => {
    onFilesChange(files.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-sky-600" />
          <Label className="cursor-pointer font-medium">{title}</Label>
        </div>
        {hasDocument && (
          <Badge className="bg-emerald-100 text-emerald-700">
            <CheckCircle className="w-3 h-3 mr-1" />
            OK
          </Badge>
        )}
      </div>

      {/* Archivos subidos */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {file.type === 'pdf' ? (
                  <File className="w-5 h-5 text-red-500 flex-shrink-0" />
                ) : file.type === 'image' ? (
                  <Image className="w-5 h-5 text-blue-500 flex-shrink-0" />
                ) : (
                  <File className="w-5 h-5 text-slate-500 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon" aria-label={`Ver ${file.name}`}
                  className="h-11 w-11 sm:h-8 sm:w-8 touch-manipulation"
                  onClick={() => setPreviewFile(file)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon" aria-label={`Quitar ${file.name}`}
                  className="h-11 w-11 sm:h-8 sm:w-8 text-red-500 touch-manipulation"
                  onClick={() => handleRemoveFile(file.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input para subir archivos */}
      <div className="relative">
        <input
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={handleFileUpload}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-sky-400 hover:bg-sky-50 transition-colors">
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-600">Arrastra archivos o haz clic para subir</span>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-4xl max-h-[calc(100dvh-0.5rem)] overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="flex justify-center">
              {previewFile.type === 'image' ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : previewFile.type === 'pdf' ? (
                <iframe
                  src={previewFile.url}
                  className="w-full h-[70vh]"
                  title={previewFile.name}
                />
              ) : (
                <div className="text-center py-8">
                  <File className="w-16 h-16 mx-auto text-slate-400 mb-4" />
                  <p className="text-slate-500">Vista previa no disponible</p>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    className="text-sky-600 hover:underline mt-2 inline-block"
                  >
                    Descargar archivo
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TechnicianForm({ technicians, onSave, onUpdate }: TechnicianFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { canCreateEntity, canEditEntity } = useAuth();
  const canManageTechnician = isEditing
    ? canEditEntity('technicians')
    : canCreateEntity('technicians');

  // Basic info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dni, setDni] = useState('');
  const [specialty, setSpecialty] = useState('general');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Documentation
  const [hasInsurance, setHasInsurance] = useState(false);
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState('');
  const [insuranceFiles, setInsuranceFiles] = useState<TechnicianFile[]>([]);
  const [hasCriminalRecord, setHasCriminalRecord] = useState(false);
  const [criminalRecordExpiryDate, setCriminalRecordExpiryDate] = useState('');
  const [criminalRecordFiles, setCriminalRecordFiles] = useState<TechnicianFile[]>([]);
  const [hasPlatformDocuments, setHasPlatformDocuments] = useState(false);
  const [platformDocumentsDate, setPlatformDocumentsDate] = useState('');
  const [platformFiles, setPlatformFiles] = useState<TechnicianFile[]>([]);

  const [error, setError] = useState('');

  useEffect(() => {
    if (isEditing && id) {
      const technician = technicians.find(t => t.id === id);
      if (technician) {
        setFirstName(technician.firstName);
        setLastName(technician.lastName);
        setPhone(technician.phone);
        setEmail(technician.email);
        setDni(technician.dni);
        setSpecialty(technician.specialty);
        setNotes(technician.notes);
        setIsActive(technician.isActive);
        setHasInsurance(technician.hasInsurance);
        setInsuranceExpiryDate(technician.insuranceExpiryDate || '');
        setInsuranceFiles(technician.insuranceFiles || []);
        setHasCriminalRecord(technician.hasCriminalRecord);
        setCriminalRecordExpiryDate(technician.criminalRecordExpiryDate || '');
        setCriminalRecordFiles(technician.criminalRecordFiles || []);
        setHasPlatformDocuments(technician.hasPlatformDocuments);
        setPlatformDocumentsDate(technician.platformDocumentsDate || '');
        setPlatformFiles(technician.platformFiles || []);
      }
    }
  }, [id, technicians, isEditing]);

  // Calculate documentation status for preview
  const previewTechnician: Technician = {
    id: 'preview',
    firstName,
    lastName,
    phone,
    email,
    dni,
    specialty,
    hasInsurance,
    insuranceExpiryDate: insuranceExpiryDate || undefined,
    insuranceFiles,
    hasCriminalRecord,
    criminalRecordExpiryDate: criminalRecordExpiryDate || undefined,
    criminalRecordFiles,
    hasPlatformDocuments,
    platformDocumentsDate: platformDocumentsDate || undefined,
    platformFiles,
    notes,
    isActive,
    createdAt: '',
    updatedAt: '',
  };
  const docStatus = checkTechnicianDocumentation(previewTechnician);

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('El nombre y apellido son obligatorios');
      return;
    }
    if (!phone.trim()) {
      setError('El teléfono es obligatorio');
      return;
    }
    if (!dni.trim()) {
      setError('El DNI es obligatorio');
      return;
    }

    const formData: TechnicianFormData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      dni: dni.trim(),
      specialty,
      hasInsurance,
      insuranceExpiryDate: hasInsurance ? insuranceExpiryDate : undefined,
      insuranceFiles,
      hasCriminalRecord,
      criminalRecordExpiryDate: hasCriminalRecord ? criminalRecordExpiryDate : undefined,
      criminalRecordFiles,
      hasPlatformDocuments,
      platformDocumentsDate: hasPlatformDocuments ? platformDocumentsDate : undefined,
      platformFiles,
      notes: notes.trim(),
      isActive,
    };

    setIsSaving(true);
    try {
      if (isEditing && id) {
        await onUpdate(id, formData);
      } else {
        await onSave(formData);
      }
      navigate('/technicians');
    } catch {
      setError('Error al guardar el técnico. Revisá la conexión y probá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!canManageTechnician) {
    return <Navigate to="/technicians" replace />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4 overflow-x-clip p-3 pb-24 sm:space-y-6 sm:p-4 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/technicians')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">
          {isEditing ? 'Editar Técnico' : 'Nuevo Técnico'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Basic Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-sky-600" />
                  Información Personal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre *</Label>
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ej: Juan"
                    />
                  </div>
                  <div>
                    <Label>Apellido *</Label>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Ej: Pérez"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>DNI *</Label>
                    <Input
                      value={dni}
                      onChange={(e) => setDni(e.target.value)}
                      placeholder="Ej: 28.456.789"
                    />
                  </div>
                  <div>
                    <Label>Especialidad</Label>
                    <select
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      className="w-full min-h-11 p-2 border rounded-lg bg-white text-base sm:text-sm"
                    >
                      {TECHNICIAN_SPECIALTIES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Teléfono *</Label>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+54 11 3456-7890"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="juan@ejemplo.com"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Notas</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Información adicional sobre el técnico..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                  <div>
                    <Label className="cursor-pointer">Técnico Activo</Label>
                    <p className="text-sm text-slate-500">
                      {isActive ? 'El técnico puede ser asignado a turnos' : 'El técnico no aparecerá en las asignaciones'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documentation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-sky-600" />
                  Documentación Requerida
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Insurance */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-sky-600" />
                      <Label className="cursor-pointer font-medium">Seguro de Responsabilidad Civil</Label>
                    </div>
                    <Switch
                      checked={hasInsurance}
                      onCheckedChange={setHasInsurance}
                    />
                  </div>
                  {hasInsurance && (
                    <div className="pl-7 space-y-3">
                      <div>
                        <Label className="text-sm text-slate-500">Fecha de vencimiento</Label>
                        <Input
                          type="date"
                          value={insuranceExpiryDate}
                          onChange={(e) => setInsuranceExpiryDate(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <FileUploadSection
                        title="Archivos del seguro (PDF/Fotos)"
                        icon={Shield}
                        files={insuranceFiles}
                        onFilesChange={setInsuranceFiles}
                        hasDocument={hasInsurance && insuranceFiles.length > 0}
                      />
                    </div>
                  )}
                </div>

                <hr />

                {/* Criminal Record */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-sky-600" />
                      <Label className="cursor-pointer font-medium">Certificado de Antecedentes Penales</Label>
                    </div>
                    <Switch
                      checked={hasCriminalRecord}
                      onCheckedChange={setHasCriminalRecord}
                    />
                  </div>
                  {hasCriminalRecord && (
                    <div className="pl-7 space-y-3">
                      <div>
                        <Label className="text-sm text-slate-500">Fecha de vencimiento</Label>
                        <Input
                          type="date"
                          value={criminalRecordExpiryDate}
                          onChange={(e) => setCriminalRecordExpiryDate(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <FileUploadSection
                        title="Archivos de antecedentes (PDF/Fotos)"
                        icon={FileCheck}
                        files={criminalRecordFiles}
                        onFilesChange={setCriminalRecordFiles}
                        hasDocument={hasCriminalRecord && criminalRecordFiles.length > 0}
                      />
                    </div>
                  )}
                </div>

                <hr />

                {/* Platform Documents */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload className="w-5 h-5 text-sky-600" />
                      <Label className="cursor-pointer font-medium">Documentación cargada en plataforma</Label>
                    </div>
                    <Switch
                      checked={hasPlatformDocuments}
                      onCheckedChange={setHasPlatformDocuments}
                    />
                  </div>
                  {hasPlatformDocuments && (
                    <div className="pl-7 space-y-3">
                      <div>
                        <Label className="text-sm text-slate-500">Fecha de carga</Label>
                        <Input
                          type="date"
                          value={platformDocumentsDate}
                          onChange={(e) => setPlatformDocumentsDate(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <FileUploadSection
                        title="Archivos de plataforma (PDF/Fotos)"
                        icon={Upload}
                        files={platformFiles}
                        onFilesChange={setPlatformFiles}
                        hasDocument={hasPlatformDocuments && platformFiles.length > 0}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Status Preview */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Estado de Documentación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {docStatus.isValid ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Documentación completa</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Falta documentación</span>
                  </div>
                )}

                {docStatus.missingDocuments.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-2">Documentos faltantes:</p>
                    <ul className="space-y-1">
                      {docStatus.missingDocuments.map((doc, i) => (
                        <li key={i} className="text-sm text-red-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                          {doc}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {docStatus.expiredDocuments.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-2">Documentos vencidos:</p>
                    <ul className="space-y-1">
                      {docStatus.expiredDocuments.map((doc, i) => (
                        <li key={i} className="text-sm text-red-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                          {doc}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {docStatus.warnings.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-2">Advertencias:</p>
                    <ul className="space-y-1">
                      {docStatus.warnings.map((warning, i) => (
                        <li key={i} className="text-sm text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Resumen de Archivos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Seguro:</span>
                  <span className={hasInsurance && insuranceFiles.length > 0 ? 'text-emerald-600' : hasInsurance ? 'text-amber-600' : 'text-red-600'}>
                    {hasInsurance && insuranceFiles.length > 0 ? `✓ ${insuranceFiles.length} archivo(s)` : hasInsurance ? '⚠ Sin archivos' : '✗ Falta'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Antecedentes:</span>
                  <span className={hasCriminalRecord && criminalRecordFiles.length > 0 ? 'text-emerald-600' : hasCriminalRecord ? 'text-amber-600' : 'text-red-600'}>
                    {hasCriminalRecord && criminalRecordFiles.length > 0 ? `✓ ${criminalRecordFiles.length} archivo(s)` : hasCriminalRecord ? '⚠ Sin archivos' : '✗ Falta'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Plataforma:</span>
                  <span className={hasPlatformDocuments && platformFiles.length > 0 ? 'text-emerald-600' : hasPlatformDocuments ? 'text-amber-600' : 'text-red-600'}>
                    {hasPlatformDocuments && platformFiles.length > 0 ? `✓ ${platformFiles.length} archivo(s)` : hasPlatformDocuments ? '⚠ Sin archivos' : '✗ Falta'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => navigate('/technicians')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving} className="bg-sky-600 hover:bg-sky-700">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Técnico'}
          </Button>
        </div>
      </form>
    </div>
  );
}
