import { describe, it, expect } from "vitest";
import {
  agingBucket,
  buildCollectionsFacts,
  buildFinanceFacts,
  computeJobMargin,
  computeMonthlyFlow,
  computeReceivables,
  daysBetween,
  lastPaymentDateFor,
  monthOf,
  shiftMonth,
  todayInBusinessTimezone,
  toEpochDay,
  type BusinessSnapshot,
} from "./agents/facts";
import { buildJobFinancialView, sumMarkedPaymentsCents } from "./agents/jobView";

// Los agentes opinan sobre plata: si estos cálculos mienten, el dueño reclama
// un saldo que no existe o deja pasar uno que sí. Toda la aritmética se testea
// sin base de datos y sin modelo.

function jobMeta(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    laborCost: 100000,
    materialsCost: 0,
    otherCosts: 0,
    ivaRate: 21,
    amountPaid: 0,
    currency: "ARS",
    productsUsed: [],
    ...over,
  });
}

function baseSnapshot(over: Partial<BusinessSnapshot> = {}): BusinessSnapshot {
  return {
    today: "2026-03-31",
    jobs: [],
    transactions: [],
    customers: [],
    products: [],
    ...over,
  };
}

describe("utilidades de fecha", () => {
  it("convierte fechas válidas y rechaza las imposibles", () => {
    expect(toEpochDay("2026-01-01")).toBe(20454);
    expect(toEpochDay("2024-02-31")).toBeNull();
    expect(toEpochDay("31/01/2026")).toBeNull();
    expect(toEpochDay("")).toBeNull();
  });

  it("cuenta días entre fechas, incluido el salto de año bisiesto", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("mal", "2026-01-01")).toBeNull();
  });

  it("clasifica la antigüedad en los tramos de cobranza", () => {
    expect(agingBucket(0)).toBe("0-15");
    expect(agingBucket(15)).toBe("0-15");
    expect(agingBucket(16)).toBe("16-30");
    expect(agingBucket(60)).toBe("31-60");
    expect(agingBucket(61)).toBe("61-90");
    expect(agingBucket(400)).toBe("90+");
  });

  it("navega meses hacia atrás cruzando el año", () => {
    expect(monthOf("2026-03-15")).toBe("2026-03");
    expect(shiftMonth("2026-01", 1)).toBe("2025-12");
    expect(shiftMonth("2026-01", 13)).toBe("2024-12");
  });

  it("usa el huso de la empresa y no UTC para saber qué día es", () => {
    // 1 de marzo 01:00 UTC es todavía 28 de febrero en Argentina (UTC-3).
    const lateNight = new Date("2026-03-01T01:00:00Z");
    expect(todayInBusinessTimezone(lateNight)).toBe("2026-02-28");
  });
});

describe("vista financiera del trabajo", () => {
  it("calcula total con IVA y saldo canónico (base legacy + cobros marcados)", () => {
    const view = buildJobFinancialView(
      { id: 1, jobNumber: "TR-01", status: "invoiced", notes: jobMeta(), legacyPaidBase: "0.00" },
      [
        { id: 10, relatedJobId: 1, isJobPayment: true, amount: "50000.00", type: "income", date: "2026-03-01" },
        { id: 11, relatedJobId: 1, isJobPayment: true, amount: "10000.00", type: "income", date: "2026-03-10" },
      ],
    );
    expect(view.totalCents).toBe(12_100_000); // 100.000 + 21%
    expect(view.paidCents).toBe(6_000_000);
    expect(view.balanceCents).toBe(6_100_000);
    expect(view.dataIssue).toBeNull();
  });

  it("no cuenta como cobro las transacciones NO marcadas del mismo trabajo", () => {
    // Un gasto o un ingreso manual imputado al trabajo no es un cobro del ledger.
    const marked = sumMarkedPaymentsCents(
      [
        { id: 1, relatedJobId: 7, isJobPayment: true, amount: "1000.00" },
        { id: 2, relatedJobId: 7, isJobPayment: false, amount: "9999.00" },
        { id: 3, relatedJobId: 8, isJobPayment: true, amount: "5000.00" },
      ],
      7,
    );
    expect(marked).toBe(100_000);
  });

  it("usa el cobrado histórico sólo cuando el trabajo no hizo cutover", () => {
    const sinCutover = buildJobFinancialView(
      { id: 2, status: "invoiced", notes: jobMeta({ amountPaid: 40000 }), legacyPaidBase: null },
      [],
    );
    expect(sinCutover.paidCents).toBe(4_000_000);

    // Con la base congelada, el cache legacy ya no se vuelve a sumar.
    const conCutover = buildJobFinancialView(
      { id: 3, status: "invoiced", notes: jobMeta({ amountPaid: 40000 }), legacyPaidBase: "40000.00" },
      [],
    );
    expect(conCutover.paidCents).toBe(4_000_000);
  });

  it("marca el trabajo como no analizable si le falta la alícuota de IVA", () => {
    const view = buildJobFinancialView(
      { id: 4, status: "invoiced", notes: jobMeta({ ivaRate: undefined }) },
      [],
    );
    expect(view.dataIssue).toContain("IVA");
  });

  it("marca el trabajo como no analizable si el ledger tiene un importe ilegible", () => {
    const view = buildJobFinancialView(
      { id: 5, status: "invoiced", notes: jobMeta(), legacyPaidBase: "0.00" },
      [{ id: 1, relatedJobId: 5, isJobPayment: true, amount: "cien mil" }],
    );
    expect(view.dataIssue).toContain("ledger");
  });
});

describe("cuentas por cobrar", () => {
  it("toma sólo trabajos ejecutados con saldo positivo", () => {
    const snapshot = baseSnapshot({
      jobs: [
        { id: 1, jobNumber: "TR-01", status: "invoiced", notes: jobMeta(), endDate: "2026-03-01", legacyPaidBase: "0.00" },
        { id: 2, jobNumber: "TR-02", status: "pending", notes: jobMeta(), endDate: "2026-03-01", legacyPaidBase: "0.00" },
        { id: 3, jobNumber: "TR-03", status: "in-progress", notes: jobMeta(), endDate: "2026-03-01", legacyPaidBase: "0.00" },
        { id: 4, jobNumber: "TR-04", status: "collected", notes: jobMeta({ amountPaid: 121000 }), endDate: "2026-03-01", legacyPaidBase: "121000.00" },
      ],
    });
    const { rows } = computeReceivables(snapshot);
    expect(rows.map((r) => r.view.jobNumber)).toEqual(["TR-01"]);
  });

  it("excluye del análisis los trabajos con datos ilegibles y lo avisa", () => {
    const snapshot = baseSnapshot({
      jobs: [
        { id: 9, jobNumber: "TR-09", status: "invoiced", notes: jobMeta({ ivaRate: "?" }), endDate: "2026-01-01" },
      ],
    });
    const { rows, warnings } = computeReceivables(snapshot);
    expect(rows).toHaveLength(0);
    expect(warnings[0]).toContain("TR-09");
  });

  it("ordena primero lo más viejo y, a igual antigüedad, lo más grande", () => {
    const snapshot = baseSnapshot({
      jobs: [
        { id: 1, jobNumber: "NUEVO", status: "invoiced", notes: jobMeta(), endDate: "2026-03-20", legacyPaidBase: "0.00" },
        { id: 2, jobNumber: "VIEJO", status: "invoiced", notes: jobMeta(), endDate: "2025-10-01", legacyPaidBase: "0.00" },
        { id: 3, jobNumber: "VIEJO-GRANDE", status: "invoiced", notes: jobMeta({ laborCost: 500000 }), endDate: "2025-10-01", legacyPaidBase: "0.00" },
      ],
    });
    const { rows } = computeReceivables(snapshot);
    expect(rows.map((r) => r.view.jobNumber)).toEqual(["VIEJO-GRANDE", "VIEJO", "NUEVO"]);
  });

  it("distingue el trabajo terminado sin facturar del reclamo al cliente", () => {
    const snapshot = baseSnapshot({
      jobs: [
        { id: 1, jobNumber: "SIN-FACTURA", status: "completed", notes: jobMeta(), endDate: "2026-03-01", legacyPaidBase: "0.00" },
        { id: 2, jobNumber: "CON-FACTURA", status: "invoiced", invoiceNumber: "A-0001", notes: jobMeta(), endDate: "2026-03-01", legacyPaidBase: "0.00" },
      ],
    });
    const { rows } = computeReceivables(snapshot);
    const sinFactura = rows.find((r) => r.view.jobNumber === "SIN-FACTURA");
    const conFactura = rows.find((r) => r.view.jobNumber === "CON-FACTURA");
    expect(sinFactura?.pendingInvoice).toBe(true);
    expect(conFactura?.pendingInvoice).toBe(false);
  });

  it("cuenta la antigüedad desde la fecha de factura cuando existe", () => {
    const snapshot = baseSnapshot({
      today: "2026-03-31",
      jobs: [
        {
          id: 1,
          status: "invoiced",
          endDate: "2026-01-01",
          notes: jobMeta({ invoiceDate: "2026-03-01" }),
          legacyPaidBase: "0.00",
        },
      ],
    });
    const { rows } = computeReceivables(snapshot);
    expect(rows[0].daysOutstanding).toBe(30);
    expect(rows[0].bucket).toBe("16-30");
  });

  it("encuentra la fecha del último cobro registrado", () => {
    const txs = [
      { id: 1, relatedJobId: 1, isJobPayment: true, amount: "100.00", date: "2026-01-15" },
      { id: 2, relatedJobId: 1, isJobPayment: true, amount: "100.00", date: "2026-02-20" },
      { id: 3, relatedJobId: 2, isJobPayment: true, amount: "100.00", date: "2026-03-30" },
    ];
    expect(lastPaymentDateFor(txs, 1)).toBe("2026-02-20");
    expect(lastPaymentDateFor(txs, 3)).toBeNull();
  });

  it("arma hechos de cobranzas con referencias citables y totales por moneda", () => {
    const facts = buildCollectionsFacts(
      baseSnapshot({
        jobs: [
          { id: 42, jobNumber: "TR-42", title: "Service", customerId: 7, customerName: "Frigorífico SA", status: "invoiced", notes: jobMeta(), endDate: "2026-02-01", legacyPaidBase: "0.00" },
        ],
      }),
    );
    expect(facts.agentKey).toBe("collections");
    expect(facts.candidates[0].ref).toBe("job:42");
    expect(facts.candidates[0].evidence.saldo).toContain("121.000");
    expect(facts.summary.trabajosConSaldo).toBe(1);
  });
});

describe("rentabilidad", () => {
  it("resta costo de productos y gastos imputados del subtotal", () => {
    const view = buildJobFinancialView(
      { id: 1, status: "completed", notes: jobMeta({ productsUsed: [{ productId: "5", quantity: 2, unitPrice: 20000 }] }) },
      [],
    );
    const margin = computeJobMargin(
      view,
      [{ id: 5, costPrice: "10000.00" }],
      [{ id: 1, relatedJobId: 1, type: "expense", amount: "15000.00" }],
    );
    // 100.000 − (2 × 10.000) − 15.000 = 65.000
    expect(margin?.marginCents).toBe(6_500_000);
    expect(margin?.marginPct).toBeCloseTo(65, 5);
  });

  it("no suma los cobros del trabajo como ganancia", () => {
    const view = buildJobFinancialView({ id: 1, status: "invoiced", notes: jobMeta(), legacyPaidBase: "0.00" }, []);
    const margin = computeJobMargin(view, [], [
      { id: 1, relatedJobId: 1, type: "income", amount: "121000.00", isJobPayment: true },
    ]);
    expect(margin?.marginCents).toBe(10_000_000);
  });

  it("estima el costo al 70% del precio de venta si el producto ya no existe", () => {
    const view = buildJobFinancialView(
      { id: 1, status: "completed", notes: jobMeta({ productsUsed: [{ productId: "999", quantity: 1, unitPrice: 10000 }] }) },
      [],
    );
    const margin = computeJobMargin(view, [], []);
    expect(margin?.marginCents).toBe(9_300_000); // 100.000 − 7.000
  });

  it("no mezcla monedas: trabajo en USD con gastos en pesos queda sin porcentaje", () => {
    const view = buildJobFinancialView(
      { id: 1, status: "invoiced", notes: jobMeta({ currency: "USD", laborCost: 1000 }), legacyPaidBase: "0.00" },
      [],
    );
    const margin = computeJobMargin(view, [], [{ id: 1, relatedJobId: 1, type: "expense", amount: "50000.00" }]);
    expect(margin?.mixedCurrencies).toBe(true);
    expect(margin?.marginPct).toBeNull();
    expect(margin?.marginCents).toBe(100_000); // el gasto en ARS no se resta de USD
  });

  it("suma ingresos y egresos por mes y arma el neto", () => {
    const flow = computeMonthlyFlow(
      [
        { id: 1, type: "income", amount: "1000.00", date: "2026-03-05" },
        { id: 2, type: "expense", amount: "400.00", date: "2026-03-20" },
        { id: 3, type: "income", amount: "700.00", date: "2026-02-10" },
        { id: 4, type: "income", amount: "999.00", date: "2025-01-10" },
      ],
      ["2026-02", "2026-03"],
    );
    expect(flow[0]).toMatchObject({ month: "2026-02", incomeCents: 70_000, netCents: 70_000 });
    expect(flow[1]).toMatchObject({ month: "2026-03", incomeCents: 100_000, expenseCents: 40_000, netCents: 60_000 });
  });

  it("prioriza en los hechos los trabajos con margen negativo o flaco", () => {
    const facts = buildFinanceFacts(
      baseSnapshot({
        jobs: [
          { id: 1, jobNumber: "SANO", status: "completed", notes: jobMeta(), endDate: "2026-03-01" },
          { id: 2, jobNumber: "PERDIDA", status: "completed", notes: jobMeta({ productsUsed: [{ productId: "1", quantity: 1, unitPrice: 200000 }] }), endDate: "2026-03-01" },
        ],
        products: [{ id: 1, costPrice: "150000.00" }],
      }),
    );
    expect(facts.candidates.map((c) => c.evidence.trabajo)).toEqual(["PERDIDA"]);
    expect(facts.summary.trabajosConMargenNegativo).toBe(1);
    expect(facts.summary.trabajosAnalizados).toBe(2);
  });
});
