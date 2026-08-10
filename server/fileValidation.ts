// Validación de archivos del lado del SERVIDOR. No confía en el contentType del
// cliente, ni en la extensión, ni en el nombre: detecta el tipo real por
// "magic bytes" y aplica una allowlist estricta + límites de tamaño.

export const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Folders permitidos para el upload legacy (público). No se acepta un folder
// arbitrario del cliente.
export const ALLOWED_FOLDERS = ["oc", "facturas", "documents", "technicians"] as const;
export type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

export type DetectedType = {
  mime: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  ext: "pdf" | "jpg" | "png" | "webp";
  maxBytes: number;
};

/**
 * Detecta el tipo real por firma binaria. Devuelve null si no es uno de los
 * tipos permitidos (PDF/JPEG/PNG/WEBP).
 */
export function detectFileType(buf: Buffer): DetectedType | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return { mime: "application/pdf", ext: "pdf", maxBytes: MAX_PDF_BYTES }; // %PDF
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg", maxBytes: MAX_IMAGE_BYTES }; // FF D8 FF
  }
  if (
    buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png", maxBytes: MAX_IMAGE_BYTES }; // 89 50 4E 47 0D 0A 1A 0A
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp", maxBytes: MAX_IMAGE_BYTES }; // RIFF....WEBP
  }
  return null;
}

/**
 * Decodifica base64 de forma estricta. Acepta un data URL opcional
 * (data:<mime>;base64,....) del que se ignora el mime declarado. Lanza si el
 * base64 es inválido o está vacío.
 */
export function decodeBase64Strict(input: string): Buffer {
  let b64 = input.trim();
  const dataUrl = b64.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/);
  if (dataUrl) {
    if (!dataUrl[2]) throw new Error("Formato de archivo no soportado");
    b64 = dataUrl[3];
  }
  b64 = b64.replace(/\s+/g, "");
  if (b64.length === 0) throw new Error("Archivo vacío");
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new Error("Archivo inválido (base64)");
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0) throw new Error("Archivo vacío");
  return buf;
}

/**
 * Nombre de archivo seguro: sin rutas, sin caracteres peligrosos, longitud
 * acotada, y con la extensión FINAL derivada del tipo REAL detectado.
 * Ej.: "factura.pdf.exe" (contenido PDF) -> "factura.pdf".
 */
export function safeStoredName(originalName: string, ext: string): string {
  const base = (originalName || "").split(/[\\/]/).pop() ?? "archivo"; // quita rutas
  let name = base.split(".")[0]; // conserva solo antes del primer punto (evita doble extensión)
  name = name.replace(/[^a-zA-Z0-9_-]/g, "_"); // caracteres seguros
  name = name.replace(/^_+|_+$/g, "");
  if (!name) name = "archivo";
  name = name.slice(0, 80); // longitud acotada
  return `${name}.${ext}`;
}

export type ValidatedFile = {
  ok: true;
  buffer: Buffer;
  mimeType: DetectedType["mime"];
  ext: DetectedType["ext"];
  safeName: string;
  sizeBytes: number;
  folder: AllowedFolder;
};
export type ValidationError = { ok: false; error: string };

function isAllowedFolder(folder: string): folder is AllowedFolder {
  return (ALLOWED_FOLDERS as readonly string[]).includes(folder);
}

/**
 * Valida un archivo entrante (base64) contra la allowlist, magic bytes, tamaño y
 * folder. Devuelve el buffer, el mime detectado y un nombre seguro, o un error.
 */
export function validateFileUpload(input: {
  fileData: string;
  fileName?: string;
  folder?: string;
}): ValidatedFile | ValidationError {
  const folder = input.folder ?? "documents";
  if (!isAllowedFolder(folder)) {
    return { ok: false, error: "Carpeta no permitida" };
  }

  let buffer: Buffer;
  try {
    buffer = decodeBase64Strict(input.fileData);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const detected = detectFileType(buffer);
  if (!detected) {
    return { ok: false, error: "Tipo de archivo no permitido. Solo PDF, JPG, PNG o WEBP." };
  }
  if (buffer.length > detected.maxBytes) {
    const mb = Math.round(detected.maxBytes / (1024 * 1024));
    return { ok: false, error: `El archivo supera el máximo permitido (${mb} MB).` };
  }

  return {
    ok: true,
    buffer,
    mimeType: detected.mime,
    ext: detected.ext,
    safeName: safeStoredName(input.fileName ?? "archivo", detected.ext),
    sizeBytes: buffer.length,
    folder,
  };
}

/**
 * Valida el campo `documents` de un técnico (JSON string con entradas cuyo `url`
 * puede ser un data URL o una URL/legacy). Bloquea data URLs peligrosos
 * (text/html, SVG, JS, ejecutables, tipos no permitidos) y valida magic
 * bytes/tamaño de los data URLs de tipos permitidos. Las entradas que NO son
 * data URLs (URLs http, referencias legacy) pasan sin cambios.
 */
export function validateTechnicianDocuments(documentsJson: string | undefined): { ok: true } | ValidationError {
  if (documentsJson == null || documentsJson.trim() === "" || documentsJson.trim() === "[]") {
    return { ok: true };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(documentsJson);
  } catch {
    return { ok: false, error: "Documentos inválidos" };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Documentos inválidos" };
  }
  for (const item of parsed) {
    const url = (item && typeof item === "object" && "url" in item) ? (item as { url?: unknown }).url : undefined;
    if (typeof url !== "string") continue; // sin data → nada que validar acá
    if (!url.startsWith("data:")) continue; // URL externa/legacy → se permite tal cual
    // Es un data URL nuevo: debe ser de un tipo permitido y con contenido real válido.
    try {
      const buffer = decodeBase64Strict(url);
      const detected = detectFileType(buffer);
      if (!detected) {
        return { ok: false, error: "Documento con formato no permitido. Solo PDF, JPG, PNG o WEBP." };
      }
      if (buffer.length > detected.maxBytes) {
        const mb = Math.round(detected.maxBytes / (1024 * 1024));
        return { ok: false, error: `Un documento supera el máximo permitido (${mb} MB).` };
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return { ok: true };
}
