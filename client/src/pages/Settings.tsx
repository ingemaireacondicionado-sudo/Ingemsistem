
import { useState, useEffect } from 'react';
import {
  User,
  Eye,
  Lock,
  EyeOff,
  Save,
  CheckCircle,
  AlertCircle,
  Building2,
  Snowflake,
  Download,
  HardDrive,
  Loader2,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';

const BUDGET_DEFAULTS_KEY = 'ingem_budget_defaults';

function loadBudgetDefaults() {
  try {
    const stored = localStorage.getItem(BUDGET_DEFAULTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    paymentTerms: 'A convenir.',
    warranty: 'Garantía de 6 meses sobre la mano de obra.',
    conditions: 'Presupuesto válido por 15 días corridos desde la fecha de emisión.\nLos trabajos se realizarán una vez aprobado el presupuesto y recibida la Orden de Compra.\nLos plazos de ejecución se confirmarán al momento de la aprobación.',
  };
}

export function Settings() {
  const { user, updatePassword } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Validaciones
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'La nueva contraseña debe tener al menos 8 caracteres' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas nuevas no coinciden' });
      return;
    }

    setIsLoading(true);

    try {
      const result = await updatePassword(currentPassword, newPassword);

      if (result.success) {
        setMessage({ type: 'success', text: 'Contraseña actualizada correctamente' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: result.error || 'Error al actualizar la contraseña' });
      }
    } catch {
      setMessage({ type: 'error', text: 'No se pudo actualizar la contraseña. Intentá de nuevo.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupDownload = async () => {
    if (user?.role !== 'admin') return;
    setBackupLoading(true);
    setBackupMessage(null);
    try {
      const response = await fetch('/api/trpc/dataExport.exportAll');
      if (!response.ok) throw new Error('No autorizado o error del servidor');
      const json = await response.json();
      const data = json.result?.data?.json;
      if (!data) throw new Error('No se pudieron obtener los datos');
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `ingem-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMessage({ type: 'success', text: `Respaldo descargado exitosamente (${date})` });
    } catch (err) {
      setBackupMessage({ type: 'error', text: 'Error al generar el respaldo. Intenta de nuevo.' });
    }
    setBackupLoading(false);
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 lg:pb-4">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Configuración</h1>
        <p className="text-slate-500 mt-1">
          Gestiona tu cuenta y preferencias del sistema
        </p>
      </div>

      {/* User Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-sky-600" />
            Perfil de Usuario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-xl font-semibold">
                {user?.name?.slice(0, 2).toUpperCase() || '??'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-xl font-semibold text-slate-800">{user?.name}</h3>
              <p className="text-slate-500">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500">INGEM - Especialistas en Termomecánica</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup & Export Card: el servidor también debe exigir rol admin */}
      {user?.role === 'admin' && (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-sky-600" />
            Respaldo de Datos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Descargá un respaldo completo de todos los datos del sistema (clientes, proveedores, productos, trabajos, finanzas, etc.) en formato JSON. Podés guardar este archivo en tu Google Drive o donde prefieras.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleBackupDownload}
                disabled={backupLoading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {backupLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {backupLoading ? 'Generando respaldo...' : 'Descargar Respaldo Completo'}
              </Button>
            </div>

            {backupMessage && (
              <Alert variant={backupMessage.type === 'success' ? 'default' : 'destructive'} className="text-sm">
                {backupMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <AlertDescription>{backupMessage.text}</AlertDescription>
              </Alert>
            )}

            <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700 mb-1">Tip: Respaldo automático</p>
              <p>Los datos se guardan automáticamente en la base de datos del servidor. Este botón te permite descargar una copia local para mayor seguridad. Recomendamos hacer un respaldo semanal y guardarlo en tu Google Drive.</p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Change Password Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-5 h-5 text-sky-600" />
            Cambiar Contraseña
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            {/* Current Password */}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Contraseña Actual</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label={showCurrentPassword ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                  className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-12"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                  className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400">Mínimo 8 caracteres</p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                  className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Message */}
            {message && (
              <Alert variant={message.type === 'success' ? 'default' : 'destructive'} className="text-sm">
                {message.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="bg-sky-600 hover:bg-sky-700"
              disabled={isLoading}
            >
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? 'Actualizando...' : 'Cambiar Contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Budget Templates */}
      <BudgetTemplateSettings />

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-600" />
            Información de la Empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <img 
              src={"https://files.manuscdn.com/user_upload_by_module/session_file/310419663032558987/CefAnGWPofMsrtoX.jpg"} 
              alt="INGEM Logo" 
              className="w-16 h-16 object-contain rounded-lg"
            />
            <div>
              <h3 className="font-semibold text-slate-800">INGEM</h3>
              <p className="text-slate-500 flex items-center gap-1">
                <Snowflake className="w-4 h-4 text-sky-500" />
                Especialistas en Termomecánica
              </p>
              <p className="text-sm text-slate-400 mt-1">Argentina</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Información del Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Versión</span>
              <span className="font-medium text-slate-800">2.0.0 (con Base de Datos)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Almacenamiento</span>
              <span className="font-medium text-slate-800">Base de datos en servidor</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Región</span>
              <span className="font-medium text-slate-800">Argentina</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Moneda</span>
              <span className="font-medium text-slate-800">Peso Argentino (ARS)</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Formato de Fecha</span>
              <span className="font-medium text-slate-800">DD/MM/AAAA</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Budget Template Settings component
function BudgetTemplateSettings() {
  const [paymentTerms, setPaymentTerms] = useState('');
  const [warranty, setWarranty] = useState('');
  const [conditions, setConditions] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const defaults = loadBudgetDefaults();
    setPaymentTerms(defaults.paymentTerms);
    setWarranty(defaults.warranty);
    setConditions(defaults.conditions);
  }, []);

  const handleSave = () => {
    localStorage.setItem(BUDGET_DEFAULTS_KEY, JSON.stringify({
      paymentTerms,
      warranty,
      conditions,
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-sky-600" />
          Plantilla de Presupuestos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">
          Configurá los textos predeterminados que se precargan al crear un presupuesto nuevo. Podés editarlos individualmente en cada presupuesto.
        </p>

        <div className="space-y-3">
          <div>
            <Label>Forma de Pago (default)</Label>
            <Textarea
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="Ej: 50% anticipo, 50% contra entrega"
              rows={2}
            />
          </div>
          <div>
            <Label>Garantía (default)</Label>
            <Input
              value={warranty}
              onChange={(e) => setWarranty(e.target.value)}
              placeholder="Ej: 6 meses sobre mano de obra"
            />
          </div>
          <div>
            <Label>Condiciones Generales (default, se imprimen al pie del PDF)</Label>
            <Textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="Condiciones generales del presupuesto..."
              rows={5}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="bg-sky-600 hover:bg-sky-700">
            <Save className="w-4 h-4 mr-2" />
            Guardar Plantilla
          </Button>
          {saved && (
            <span className="text-sm text-emerald-600 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> Guardado
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
