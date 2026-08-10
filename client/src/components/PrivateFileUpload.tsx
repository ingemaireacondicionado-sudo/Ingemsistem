import { useState, useRef } from 'react';
import { Upload, FileText, X, ExternalLink, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

// Prefijo que distingue una referencia a un archivo PRIVADO (guardado en la base
// vía privateFiles.upload) de una URL legacy pública de Forge.
//   - "private:<id>"  -> archivo privado nuevo (se descarga autenticado)
//   - "https://..."   -> URL legacy existente (se abre tal cual, no se toca)
const PRIVATE_PREFIX = 'private:';

export function isPrivateRef(value?: string): boolean {
  return typeof value === 'string' && value.startsWith(PRIVATE_PREFIX);
}
function privateIdOf(value: string): number | null {
  const raw = value.slice(PRIVATE_PREFIX.length);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface PrivateFileUploadProps {
  label: string;
  // Valor actual guardado en el formulario: "private:<id>" (nuevo) o URL legacy.
  currentFileUrl?: string;
  // Devuelve la nueva referencia a guardar en el formulario ("private:<id>").
  onFileUploaded: (ref: string) => void;
  // Quita la referencia del formulario. NO elimina el archivo de la base
  // (no hay borrado permanente): la fila queda sin referenciar.
  onFileRemoved: () => void;
  category: 'purchase_order' | 'invoice';
  accept?: string;
  // Límite de tamaño en cliente (el servidor vuelve a validar por tipo real).
  maxSizeMB?: number;
}

export function PrivateFileUpload({
  label,
  currentFileUrl,
  onFileUploaded,
  onFileRemoved,
  category,
  accept = '.pdf,.jpg,.jpeg,.png,.webp',
  maxSizeMB = 8,
}: PrivateFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.privateFiles.upload.useMutation();
  const utils = trpc.useUtils();

  const isPrivate = isPrivateRef(currentFileUrl);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`El archivo es demasiado grande. Máximo ${maxSizeMB}MB.`);
      return;
    }

    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // sin el prefijo data:...;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        category,
      });
      onFileUploaded(`${PRIVATE_PREFIX}${result.privateFileId}`);
    } catch (err) {
      console.error('Upload error:', err);
      setError('Error al subir el archivo. Verificá el tipo/tamaño e intentá de nuevo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Descarga autenticada de un archivo privado: pide el contenido, arma un Blob
  // y fuerza la descarga como adjunto con el nombre saneado por el servidor.
  const handlePrivateDownload = async () => {
    if (!currentFileUrl) return;
    const id = privateIdOf(currentFileUrl);
    if (id == null) {
      setError('Referencia de archivo inválida.');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      const res = await utils.privateFiles.download.fetch({ id });
      const byteChars = atob(res.dataBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.fileName; // nombre ya saneado en el servidor
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setError('No se pudo descargar el archivo.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>

      {currentFileUrl ? (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-700 truncate flex-1">Archivo adjunto</span>
          {isPrivate ? (
            <button
              type="button"
              onClick={handlePrivateDownload}
              disabled={downloading}
              className="text-emerald-600 hover:text-emerald-800 shrink-0 disabled:opacity-50"
              title="Descargar archivo"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
          ) : (
            // Legacy: URL pública existente, se abre tal cual (no se re-sube ni altera).
            <a
              href={currentFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:text-emerald-800 shrink-0"
              title="Ver archivo"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onFileRemoved}
            className="text-slate-400 hover:text-red-500 shrink-0"
            title="Quitar archivo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            className="hidden"
            id={`private-file-upload-${category}-${label}`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-dashed border-2 h-10"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Adjuntar PDF
              </>
            )}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
