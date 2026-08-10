import { describe, it, expect } from "vitest";
import { parsePaymentAmountCents, readStoredMoneyCents, readStoredRate, MAX_AMOUNT_CENTS } from "./money";

describe("parsePaymentAmountCents — parser estricto de montos entrantes", () => {
  it("acepta enteros y hasta 2 decimales", () => {
    expect(parsePaymentAmountCents("100")).toEqual({ ok: true, cents: 10000 });
    expect(parsePaymentAmountCents("100.5")).toEqual({ ok: true, cents: 10050 });
    expect(parsePaymentAmountCents("100.50")).toEqual({ ok: true, cents: 10050 });
    expect(parsePaymentAmountCents("0.01")).toEqual({ ok: true, cents: 1 });
    expect(parsePaymentAmountCents("  100  ")).toEqual({ ok: true, cents: 10000 }); // trim
  });

  it("acepta el máximo de DECIMAL(12,2) y rechaza el overflow", () => {
    expect(parsePaymentAmountCents("9999999999.99")).toEqual({ ok: true, cents: MAX_AMOUNT_CENTS });
    expect(parsePaymentAmountCents("10000000000").ok).toBe(false);
    expect(parsePaymentAmountCents("99999999999999").ok).toBe(false);
  });

  it("rechaza vacío, cero, negativos y basura", () => {
    for (const bad of ["", "   ", "0", "0.00", "-10", "-0.5", "10.999", "100abc", "abc", "NaN", "Infinity", "-Infinity", "1e3", ".5", "100.", "1,5", "$100"]) {
      expect(parsePaymentAmountCents(bad).ok, `debería rechazar "${bad}"`).toBe(false);
    }
    expect(parsePaymentAmountCents(undefined as any).ok).toBe(false);
    expect(parsePaymentAmountCents(100 as any).ok).toBe(false);
  });
});

describe("readStoredMoneyCents — lector tolerante de valores guardados", () => {
  it("acepta number y string numérico; redondea a centavos", () => {
    expect(readStoredMoneyCents(5000)).toBe(500000);
    expect(readStoredMoneyCents("5000")).toBe(500000);
    expect(readStoredMoneyCents("5000.5")).toBe(500050);
    expect(readStoredMoneyCents(3.33)).toBe(333);
    // Tolera floats viejos con ruido de precisión.
    expect(readStoredMoneyCents("12345.600000000001")).toBe(1234560);
  });
  it("campo ausente ⇒ 0; presente pero inválido ⇒ null", () => {
    expect(readStoredMoneyCents(undefined)).toBe(0);
    expect(readStoredMoneyCents(null)).toBe(0);
    expect(readStoredMoneyCents("")).toBe(0);
    expect(readStoredMoneyCents("abc")).toBeNull();
    expect(readStoredMoneyCents(NaN)).toBeNull();
    expect(readStoredMoneyCents(Infinity)).toBeNull();
    expect(readStoredMoneyCents({} as any)).toBeNull();
  });
});

describe("readStoredRate — alícuota de IVA guardada", () => {
  it("acepta 0 y 21 (number/string) y tasas válidas", () => {
    expect(readStoredRate(21)).toBe(21);
    expect(readStoredRate("21")).toBe(21);
    expect(readStoredRate(0)).toBe(0);
    expect(readStoredRate("0")).toBe(0);
    expect(readStoredRate("10.5")).toBe(10.5);
  });
  it("falta o inválida ⇒ null", () => {
    expect(readStoredRate(undefined)).toBeNull();
    expect(readStoredRate(null)).toBeNull();
    expect(readStoredRate("")).toBeNull();
    expect(readStoredRate("abc")).toBeNull();
    expect(readStoredRate(-1)).toBeNull();
    expect(readStoredRate(Infinity)).toBeNull();
  });
});
