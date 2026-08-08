import { useState, useRef } from 'react';
import { Upload, FileText, X, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

interface FileUploadProps {
  label: string;
  currentFileUrl?: string;
  onFileUploaded: (url: string) => void;
  onFileRemoved: () => void;
  folder?: string;
  accept?: string;
  maxSizeMB?: number;
}

export function FileUpload({
  label,
  currentFileUrl,
  onFileUploaded,
  onFileRemoved,
  folder = 'documents',
  accept = '.pdf,.jpg,.jpeg,.png',
  maxSizeMB = 10,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.files.upload.useMutation();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Validate size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`El archivo es demasiado grande. Máximo ${maxSizeMB}MB.`);
      return;
    }

    setUploading(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:xxx;base64, prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type || 'application/pdf',
        folder,
      });

      onFileUploaded(result.url);
    } catch (err) {
      console.error('Upload error:', err);
      setError('Error al subir el archivo. Intentá de nuevo.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      
      {currentFileUrl ? (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-700 truncate flex-1">
            Archivo adjunto
          </span>
          <a
            href={currentFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:text-emerald-800 shrink-0"
            title="Ver archivo"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
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
            id={`file-upload-${folder}-${label}`}
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

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
