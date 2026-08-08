import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Job, JobProduct } from '@/types/job';
import { INGEM_LOGO_DATA_URL } from '@/assets/ingemLogoBase64';

// INGEM company data
const COMPANY = {
  name: 'INGEM',
  subtitle: 'Especialistas en Termomecánica',
  cuit: '23-37374776-9',
  phone: '11 5467-3062',
  address: 'Calle 30 N° 2003, Guernica',
  province: 'Buenos Aires, Argentina',
  email: 'ingemaireacondicionado@gmail.com',
  logo: INGEM_LOGO_DATA_URL,
};

function formatCurrencyPdf(amount: number, currency: string): string {
  const symbol = currency === 'USD' ? 'US$' : '$';
  return `${symbol} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDatePdf(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('es-AR');
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export async function generateBudgetPdf(job: Job): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Logo embebido localmente (no depende de internet)
  const logoBase64: string | null = COMPANY.logo;

  // === HEADER ===
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', margin, y, 25, 25);
  }

  const headerX = margin + 30;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 95);
  doc.text(COMPANY.name, headerX, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(COMPANY.subtitle, headerX, y + 14);
  doc.text(`CUIT: ${COMPANY.cuit}`, headerX, y + 19);
  doc.text(`Tel: ${COMPANY.phone} | ${COMPANY.email}`, headerX, y + 24);

  // Budget number and date (right aligned)
  const budgetNumber = job.budgetNumber || `PR-${job.jobNumber}`;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 95);
  doc.text('PRESUPUESTO', pageWidth - margin, y + 6, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`N°: ${budgetNumber}`, pageWidth - margin, y + 12, { align: 'right' });
  doc.text(`Fecha: ${formatDatePdf(job.budgetDate || job.startDate)}`, pageWidth - margin, y + 17, { align: 'right' });
  if (job.dueDate) {
    doc.text(`Válido hasta: ${formatDatePdf(job.dueDate)}`, pageWidth - margin, y + 22, { align: 'right' });
  }

  y += 32;

  // Separator line
  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // === CLIENT INFO ===
  const clientBoxHeight = job.budgetWorksite ? 34 : 28;
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, contentWidth, clientBoxHeight, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 95);
  doc.text('DATOS DEL CLIENTE', margin + 5, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  doc.text(`Cliente: ${job.clientName}`, margin + 5, y + 13);

  if (job.clientCuit) {
    doc.text(`CUIT: ${job.clientCuit}`, margin + 5, y + 19);
  }
  if (job.clientPhone) {
    doc.text(`Teléfono: ${job.clientPhone}`, margin + 5, y + 25);
  }

  // Right column
  if (job.budgetWorksite) {
    doc.text(`Lugar de obra: ${job.budgetWorksite}`, pageWidth / 2, y + 13);
  }
  if (job.isConsumerFinal && job.consumerFinalAddress) {
    doc.text(`Dirección: ${job.consumerFinalAddress}`, pageWidth / 2, y + 19);
  }
  if (job.isConsumerFinal && job.consumerFinalDni) {
    doc.text(`DNI: ${job.consumerFinalDni}`, pageWidth / 2, y + 25);
  }

  y += clientBoxHeight + 6;

  // === WORK DESCRIPTION ===
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 95);
  doc.text('DESCRIPCIÓN DEL TRABAJO', margin, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  doc.text(job.title, margin, y);
  y += 5;

  if (job.description) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(job.description, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 4 + 2;
  }

  if (job.details) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const detailLines = doc.splitTextToSize(job.details, contentWidth);
    doc.text(detailLines, margin, y);
    y += detailLines.length * 4 + 2;
  }

  y += 4;

  // === ITEMS TABLE ===
  const tableBody: (string | number)[][] = [];

  if (job.productsUsed && job.productsUsed.length > 0) {
    job.productsUsed.forEach((p: JobProduct) => {
      tableBody.push([
        p.productName,
        String(p.quantity),
        formatCurrencyPdf(p.unitPrice, job.currency),
        formatCurrencyPdf(p.totalPrice, job.currency),
      ]);
    });
  }

  if (job.laborCost > 0) {
    tableBody.push([
      'Mano de obra',
      '1',
      formatCurrencyPdf(job.laborCost, job.currency),
      formatCurrencyPdf(job.laborCost, job.currency),
    ]);
  }

  if (job.materialsCost > 0 && (!job.productsUsed || job.productsUsed.length === 0)) {
    tableBody.push([
      'Materiales',
      '1',
      formatCurrencyPdf(job.materialsCost, job.currency),
      formatCurrencyPdf(job.materialsCost, job.currency),
    ]);
  }

  if (job.otherCosts > 0) {
    tableBody.push([
      'Otros gastos',
      '1',
      formatCurrencyPdf(job.otherCosts, job.currency),
      formatCurrencyPdf(job.otherCosts, job.currency),
    ]);
  }

  if (tableBody.length === 0) {
    const amount = job.budgetAmount || job.totalAmount;
    tableBody.push([
      job.title,
      '1',
      formatCurrencyPdf(amount, job.currency),
      formatCurrencyPdf(amount, job.currency),
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // === TOTALS ===
  const totalsX = pageWidth - margin - 70;
  const totalsWidth = 70;

  const productsTotal = job.productsUsed?.reduce((s: number, p: JobProduct) => s + p.totalPrice, 0) || 0;
  const materialsOrProducts = productsTotal > 0 ? productsTotal : job.materialsCost;
  const grossSubtotal = job.laborCost + materialsOrProducts + job.otherCosts;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  // Show discount if applicable
  if (job.budgetDiscountValue && job.budgetDiscountValue > 0) {
    doc.text('Subtotal bruto:', totalsX, y);
    doc.text(formatCurrencyPdf(grossSubtotal, job.currency), totalsX + totalsWidth, y, { align: 'right' });
    y += 5;

    const discountAmount = job.budgetDiscountType === 'percent'
      ? (grossSubtotal * job.budgetDiscountValue) / 100
      : job.budgetDiscountValue;

    doc.setTextColor(200, 50, 50);
    const discLabel = job.budgetDiscountType === 'percent' ? `${job.budgetDiscountValue}%` : 'fijo';
    doc.text(`Descuento (${discLabel}):`, totalsX, y);
    doc.text(`-${formatCurrencyPdf(discountAmount, job.currency)}`, totalsX + totalsWidth, y, { align: 'right' });
    y += 5;

    doc.setTextColor(60, 60, 60);
    const netSubtotal = grossSubtotal - discountAmount;
    doc.text('Subtotal:', totalsX, y);
    doc.text(formatCurrencyPdf(netSubtotal, job.currency), totalsX + totalsWidth, y, { align: 'right' });
    y += 5;
  } else {
    const displaySubtotal = grossSubtotal > 0 ? grossSubtotal : (job.budgetAmount || job.totalAmount);
    doc.text('Subtotal:', totalsX, y);
    doc.text(formatCurrencyPdf(displaySubtotal, job.currency), totalsX + totalsWidth, y, { align: 'right' });
    y += 5;
  }

  // IVA
  if (job.ivaRate > 0) {
    let netSub = grossSubtotal;
    if (job.budgetDiscountValue && job.budgetDiscountValue > 0) {
      const disc = job.budgetDiscountType === 'percent'
        ? (grossSubtotal * job.budgetDiscountValue) / 100
        : job.budgetDiscountValue;
      netSub = grossSubtotal - disc;
    }
    const ivaAmount = (netSub * job.ivaRate) / 100;
    doc.text(`IVA (${job.ivaRate}%):`, totalsX, y);
    doc.text(formatCurrencyPdf(ivaAmount, job.currency), totalsX + totalsWidth, y, { align: 'right' });
    y += 5;
  }

  // Total
  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(0.3);
  doc.line(totalsX, y, totalsX + totalsWidth, y);
  y += 5;

  const total = job.budgetAmount || job.totalAmount;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 95);
  doc.text('TOTAL:', totalsX, y);
  doc.text(formatCurrencyPdf(total, job.currency), totalsX + totalsWidth, y, { align: 'right' });

  y += 12;

  // === CURRENCY NOTICE ===
  if (job.currency === 'USD') {
    doc.setFillColor(255, 250, 230);
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120, 90, 0);
    doc.text(
      'Valores expresados en Dólares Estadounidenses (USD). Precio sujeto a la cotización del',
      margin + 3,
      y + 5
    );
    doc.text(
      'Dólar Banco Nación venta billete al momento del pago.',
      margin + 3,
      y + 9
    );
    y += 16;
  } else {
    doc.setFillColor(255, 250, 230);
    doc.roundedRect(margin, y, contentWidth, 8, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120, 90, 0);
    doc.text(
      'Precio sujeto a la cotización del Dólar Banco Nación venta billete al momento del pago.',
      margin + 3,
      y + 5
    );
    y += 12;
  }

  // === COMMERCIAL TERMS ===
  const terms: string[] = [];
  if (job.budgetPaymentTerms) terms.push(`Forma de pago: ${job.budgetPaymentTerms}`);
  if (job.budgetDeliveryTerm) terms.push(`Plazo de entrega: ${job.budgetDeliveryTerm}`);
  if (job.budgetWarranty) terms.push(`Garantía: ${job.budgetWarranty}`);

  if (terms.length > 0 && y < 240) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 95);
    doc.text('CONDICIONES COMERCIALES', margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);

    terms.forEach((term) => {
      doc.text(`• ${term}`, margin, y);
      y += 4;
    });
    y += 2;
  }

  // === GENERAL CONDITIONS ===
  if (job.budgetConditions && y < 255) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 95);
    doc.text('CONDICIONES GENERALES', margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);

    const condLines = job.budgetConditions.split('\n');
    condLines.forEach((line) => {
      if (line.trim()) {
        doc.text(`• ${line.trim()}`, margin, y);
        y += 4;
      }
    });
  } else if (!job.budgetConditions && y < 240) {
    // Fallback to default conditions if none specified
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 95);
    doc.text('CONDICIONES', margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);

    const defaultConditions = [
      'Presupuesto válido por 15 días corridos desde la fecha de emisión.',
      'Forma de pago: a convenir.',
      'Los trabajos se realizarán una vez aprobado el presupuesto y recibida la Orden de Compra.',
      'Los plazos de ejecución se confirmarán al momento de la aprobación.',
    ];

    defaultConditions.forEach((cond) => {
      doc.text(`• ${cond}`, margin, y);
      y += 4;
    });
  }

  // === FOOTER ===
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${COMPANY.name} | CUIT: ${COMPANY.cuit} | ${COMPANY.address}, ${COMPANY.province} | Tel: ${COMPANY.phone}`,
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  // Save the PDF
  const fileName = `Presupuesto_${budgetNumber}_${job.clientName.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
