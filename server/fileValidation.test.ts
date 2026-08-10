import { describe, it, expect } from "vitest";
import {
  detectFileType,
  decodeBase64Strict,
  safeStoredName,
  validateFileUpload,
  validateTechnicianDocuments,
  MAX_PDF_BYTES,
  MAX_IMAGE_BYTES,
} from "./fileValidation";

// ===== Muestras mínimas con magic bytes reales =====
function pdfBuf(size = 64): Buffer {
  const b = Buffer.alloc(size, 0x20);
  Buffer.from("%PDF-1.4\n").copy(b, 0);
  return b;
}
function jpegBuf(size = 64): Buffer {
  const b = Buffer.alloc(size, 0x00);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}
function pngBuf(size = 64): Buffer {
  const b = Buffer.alloc(size, 0x00);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  return b;
}
function webpBuf(size = 64): Buffer {
  const b = Buffer.alloc(size, 0x00);
  Buffer.from("RIFF").copy(b, 0);
  Buffer.from("WEBP").copy(b, 8);
  return b;
}
const b64 = (buf: Buffer) => buf.toString("base64");

describe("detectFileType — magic bytes", () => {
  it("detecta PDF/JPEG/PNG/WEBP", () => {
    expect(detectFileType(pdfBuf())?.mime).toBe("application/pdf");
    expect(detectFileType(jpegBuf())?.mime).toBe("image/jpeg");
    expect(detectFileType(pngBuf())?.mime).toBe("image/png");
    expect(detectFileType(webpBuf())?.mime).toBe("image/webp");
  });
  it("rechaza contenido no permitido (exe/js/html/svg)", () => {
    expect(detectFileType(Buffer.from("MZ\x90\x00"))).toBeNull(); // EXE (MZ)
    expect(detectFileType(Buffer.from("console.log(1)"))).toBeNull(); // JS
    expect(detectFileType(Buffer.from("<!doctype html><script>"))).toBeNull(); // HTML
    expect(detectFileType(Buffer.from("<svg xmlns='...'></svg>"))).toBeNull(); // SVG
  });
});

describe("validateFileUpload — allowlist, tamaño, folder, nombre", () => {
  it("acepta PDF/JPEG/PNG/WEBP válidos y fuerza el MIME detectado", () => {
    for (const [buf, mime] of [
      [pdfBuf(), "application/pdf"], [jpegBuf(), "image/jpeg"],
      [pngBuf(), "image/png"], [webpBuf(), "image/webp"],
    ] as const) {
      const r = validateFileUpload({ fileData: b64(buf), fileName: "x", folder: "oc" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.mimeType).toBe(mime);
    }
  });

  it("rechaza EXE, JS, HTML, SVG y MIME falso", () => {
    const cases = ["MZ\x90\x00ejecutable", "alert(1)", "<html><script>x</script>", "<svg onload=alert(1)>"];
    for (const c of cases) {
      const r = validateFileUpload({ fileData: Buffer.from(c).toString("base64"), fileName: "x", folder: "oc" });
      expect(r.ok).toBe(false);
    }
  });

  it("rechaza PDF falso (extensión .pdf pero contenido ejecutable)", () => {
    const r = validateFileUpload({ fileData: Buffer.from("MZ\x90\x00").toString("base64"), fileName: "factura.pdf", folder: "facturas" });
    expect(r.ok).toBe(false);
  });

  it("factura.pdf.exe con contenido PDF real → aceptado y renombrado a .pdf", () => {
    const r = validateFileUpload({ fileData: b64(pdfBuf()), fileName: "factura.pdf.exe", folder: "facturas" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.safeName).toBe("factura.pdf");
  });

  it("rechaza archivo vacío y base64 inválido", () => {
    expect(validateFileUpload({ fileData: "", folder: "oc" }).ok).toBe(false);
    expect(validateFileUpload({ fileData: "no-es-base64-válido!!", folder: "oc" }).ok).toBe(false);
  });

  it("rechaza PDF > 8 MB e imagen > 5 MB", () => {
    const bigPdf = validateFileUpload({ fileData: b64(pdfBuf(MAX_PDF_BYTES + 10)), fileName: "x", folder: "oc" });
    expect(bigPdf.ok).toBe(false);
    const bigImg = validateFileUpload({ fileData: b64(pngBuf(MAX_IMAGE_BYTES + 10)), fileName: "x", folder: "technicians" });
    expect(bigImg.ok).toBe(false);
  });

  it("acepta PDF cerca del límite (8 MB) e imagen (5 MB)", () => {
    expect(validateFileUpload({ fileData: b64(pdfBuf(MAX_PDF_BYTES)), fileName: "x", folder: "oc" }).ok).toBe(true);
    expect(validateFileUpload({ fileData: b64(pngBuf(MAX_IMAGE_BYTES)), fileName: "x", folder: "oc" }).ok).toBe(true);
  });

  it("rechaza folder no permitido y folder con path traversal", () => {
    expect(validateFileUpload({ fileData: b64(pdfBuf()), folder: "../secret" }).ok).toBe(false);
    expect(validateFileUpload({ fileData: b64(pdfBuf()), folder: ".." }).ok).toBe(false);
    expect(validateFileUpload({ fileData: b64(pdfBuf()), folder: "arbitraria" }).ok).toBe(false);
  });

  it("neutraliza path traversal en el nombre y acota longitud", () => {
    const r = validateFileUpload({ fileData: b64(pdfBuf()), fileName: "../../etc/passwd", folder: "oc" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.safeName).not.toContain("/");
      expect(r.safeName).not.toContain("..");
      expect(r.safeName.endsWith(".pdf")).toBe(true);
    }
    const longName = "a".repeat(500) + ".pdf";
    const r2 = validateFileUpload({ fileData: b64(pdfBuf()), fileName: longName, folder: "oc" });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.safeName.length).toBeLessThanOrEqual(85);
  });
});

describe("safeStoredName", () => {
  it("deriva la extensión del tipo real y elimina rutas/dobles extensiones", () => {
    expect(safeStoredName("../../factura.pdf.exe", "pdf")).toBe("factura.pdf");
    expect(safeStoredName("mi foto rara@!.png", "jpg")).toBe("mi_foto_rara.jpg");
    expect(safeStoredName("", "pdf")).toBe("archivo.pdf");
  });
});

describe("validateTechnicianDocuments", () => {
  it("acepta vacío / [] / documentos válidos (data URLs pdf/imagen)", () => {
    expect(validateTechnicianDocuments("[]").ok).toBe(true);
    expect(validateTechnicianDocuments("").ok).toBe(true);
    const docs = JSON.stringify([
      { id: "1", name: "dni.pdf", url: `data:application/pdf;base64,${b64(pdfBuf())}` },
      { id: "2", name: "foto.png", url: `data:image/png;base64,${b64(pngBuf())}` },
    ]);
    expect(validateTechnicianDocuments(docs).ok).toBe(true);
  });

  it("bloquea data:text/html, SVG y JS", () => {
    const html = JSON.stringify([{ id: "1", name: "x", url: `data:text/html;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}` }]);
    expect(validateTechnicianDocuments(html).ok).toBe(false);
    const svg = JSON.stringify([{ id: "1", name: "x", url: `data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}` }]);
    expect(validateTechnicianDocuments(svg).ok).toBe(false);
    const js = JSON.stringify([{ id: "1", name: "x", url: `data:application/javascript;base64,${Buffer.from("alert(1)").toString("base64")}` }]);
    expect(validateTechnicianDocuments(js).ok).toBe(false);
  });

  it("permite URLs externas/legacy (no data URL) sin tocarlas", () => {
    const legacy = JSON.stringify([{ id: "1", name: "x", url: "https://files.manuscdn.com/algo.pdf" }]);
    expect(validateTechnicianDocuments(legacy).ok).toBe(true);
  });

  it("rechaza un documento demasiado grande y JSON inválido", () => {
    const big = JSON.stringify([{ id: "1", name: "x", url: `data:application/pdf;base64,${b64(pdfBuf(MAX_PDF_BYTES + 10))}` }]);
    expect(validateTechnicianDocuments(big).ok).toBe(false);
    expect(validateTechnicianDocuments("{no-json").ok).toBe(false);
  });
});
