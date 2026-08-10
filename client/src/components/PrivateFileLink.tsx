import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { isPrivateRef } from '@/components/PrivateFileUpload';

interface PrivateFileLinkProps {
  // "private:<id>" (archivo privado nuevo) o URL legacy pública.
  value: string;
  label: string;
  className?: string;
}

function privateIdOf(value: string): number | null {
  const raw = value.slice('private:'.length);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Muestra un enlace a un archivo de OC/factura. Si es una referencia privada
 * ("private:<id>") descarga el contenido de forma autenticada y lo abre como
 * adjunto; si es una URL legacy la abre directamente (sin tocarla).
 */
export function PrivateFileLink({ value, label, className }: PrivateFileLinkProps) {
  const [downloading, setDownloading] = useState(false);
  const utils = trpc.useUtils();
  const isPrivate = isPrivateRef(value);

  if (!isPrivate) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        <FileText className="w-3 h-3" />
        {label}
      </a>
    );
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = privateIdOf(value);
    if (id == null) return;
    setDownloading(true);
    try {
      const res = await utils.privateFiles.download.fetch({ id });
      const byteChars = atob(res.dataBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button type="button" onClick={handleDownload} disabled={downloading} className={className}>
      {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
      {label}
    </button>
  );
}
