import { describe, it, expect } from "vitest";
import { parsePaymentAmountCents, readStoredMoneyCents, readExactStoredMoneyCents, isAbsentMoneyValue, readStoredRate, centsToDecimalString, MAX_AMOUNT_CENTS } from "./money";

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

describe("readExactStoredMoneyCents — lector EXACTO fail-closed (cutover 8B-5c)", () => {
  it("acepta montos INEQUÍVOCOS (≤2 decimales significativos) sin redondear", () => {
    expect(readExactStoredMoneyCents(4000)).toEqual({ ok: true, cents: 400000 });
    expect(readExactStoredMoneyCents(1234.5)).toEqual({ ok: true, cents: 123450 });
    expect(readExactStoredMoneyCents(1234.56)).toEqual({ ok: true, cents: 123456 }); // sin error float
    expect(readExactStoredMoneyCents("1234.56")).toEqual({ ok: true, cents: 123456 });
    expect(readExactStoredMoneyCents("0.01")).toEqual({ ok: true, cents: 1 });
    // Ceros a la derecha NO son precisión → se aceptan.
    expect(readExactStoredMoneyCents("1234.500")).toEqual({ ok: true, cents: 123450 });
    expect(readExactStoredMoneyCents("100.00")).toEqual({ ok: true, cents: 10000 });
  });

  it("campo ausente ⇒ 0 (inequívoco: nada cobrado)", () => {
    expect(readExactStoredMoneyCents(undefined)).toEqual({ ok: true, cents: 0 });
    expect(readExactStoredMoneyCents(null)).toEqual({ ok: true, cents: 0 });
    expect(readExactStoredMoneyCents("")).toEqual({ ok: true, cents: 0 });
    expect(readExactStoredMoneyCents("   ")).toEqual({ ok: true, cents: 0 });
  });

  it("AMBIGUOUS: >2 decimales significativos o notación científica → fail-closed", () => {
    expect(readExactStoredMoneyCents(100.005)).toEqual({ ok: false, reason: "ambiguous" });
    expect(readExactStoredMoneyCents("4000.999")).toEqual({ ok: false, reason: "ambiguous" });
    expect(readExactStoredMoneyCents("12345.600000000001")).toEqual({ ok: false, reason: "ambiguous" });
    expect(readExactStoredMoneyCents("1e3")).toEqual({ ok: false, reason: "ambiguous" });
    expect(readExactStoredMoneyCents(1e3 + 0.001)).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("INVALID: basura, no numérico, negativo o fuera de rango → fail-closed", () => {
    expect(readExactStoredMoneyCents("abc")).toEqual({ ok: false, reason: "invalid" });
    expect(readExactStoredMoneyCents("100abc")).toEqual({ ok: false, reason: "invalid" });
    expect(readExactStoredMoneyCents(NaN)).toEqual({ ok: false, reason: "invalid" });
    expect(readExactStoredMoneyCents(Infinity)).toEqual({ ok: false, reason: "invalid" });
    expect(readExactStoredMoneyCents({} as any)).toEqual({ ok: false, reason: "invalid" });
    expect(readExactStoredMoneyCents(-10)).toEqual({ ok: false, reason: "invalid" });
    expect(readExactStoredMoneyCents("-0.5")).toEqual({ ok: false, reason: "invalid" });
    expect(readExactStoredMoneyCents("99999999999999").ok).toBe(false); // > DECIMAL(12,2)
    expect(readExactStoredMoneyCents("-0")).toEqual({ ok: true, cents: 0 }); // -0 == 0
  });

  it("congela de forma inversible con centsToDecimalString (round-trip exacto)", () => {
    for (const raw of ["0", "4000", "1234.5", "1234.56", "0.01", "9999999999.99"]) {
      const r = readExactStoredMoneyCents(raw);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const frozen = centsToDecimalString(r.cents);
        // Re-leer la base congelada da los MISMOS centavos (no hay deriva).
        expect(readExactStoredMoneyCents(frozen)).toEqual({ ok: true, cents: r.cents });
      }
    }
  });
});

describe("isAbsentMoneyValue — presencia explícita (cutover legacy: missing ≠ zero)", () => {
  it("AUSENTE: undefined, null, '' y sólo whitespace", () => {
    expect(isAbsentMoneyValue(undefined)).toBe(true);
    expect(isAbsentMoneyValue(null)).toBe(true);
    expect(isAbsentMoneyValue("")).toBe(true);
    expect(isAbsentMoneyValue("   ")).toBe(true);
    expect(isAbsentMoneyValue("\t\n ")).toBe(true);
  });
  it("PRESENTE: cero explícito y cualquier número/valor", () => {
    expect(isAbsentMoneyValue(0)).toBe(false);
    expect(isAbsentMoneyValue("0")).toBe(false);
    expect(isAbsentMoneyValue("0.00")).toBe(false);
    expect(isAbsentMoneyValue("100")).toBe(false);
    expect(isAbsentMoneyValue("abc")).toBe(false); // presente pero indeterminable
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
