
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Snowflake, Building2, Eye, EyeOff, Lock, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Error al iniciar sesión');
      }
    } catch {
      setError('No se pudo iniciar sesión. Intentá de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-[calc(1rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img 
              src={"https://files.manuscdn.com/user_upload_by_module/session_file/310419663032558987/CefAnGWPofMsrtoX.jpg"} 
              alt="INGEM Logo" 
              className="h-24 w-auto object-contain sm:h-32"
            />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">INGEM</h1>
          <p className="text-slate-500 mt-1 flex items-center justify-center gap-2">
            <Snowflake className="w-4 h-4 text-sky-500" />
            Especialistas en Termomecánica
            <Snowflake className="w-4 h-4 text-sky-500" />
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl border-0">
          <CardContent className="p-5 sm:p-8">
            <h2 className="text-xl font-semibold text-center text-slate-700 mb-6">
              Iniciar Sesión
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Usuario / Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@ingem.com"
                    className="h-11 pl-10 text-base"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 pl-10 pr-12 text-base"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <Alert variant="destructive" className="text-sm">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="h-11 w-full touch-manipulation bg-sky-600 hover:bg-sky-700"
                disabled={isLoading}
              >
                {isLoading ? 'Ingresando...' : 'Ingresar'}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400 flex items-center justify-center gap-2">
                <Building2 className="w-4 h-4" />
                Sistema de Gestión INGEM - Argentina
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-slate-400 text-sm mt-6">
          © {new Date().getFullYear()} INGEM Argentina - Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
