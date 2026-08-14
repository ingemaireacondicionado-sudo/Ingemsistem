// Utilidades monetarias en CENTAVOS enteros, para evitar errores de punto
// flotante en comparaciones financieras (saldo, total, pagos). No agrega
// dependencias externas.

// DECIMAL(12,2): máximo 9_999_999_999.99 → en centavos 999_999_999_999.
export const MAX_AMOUNT_CENTS = 999_999_999_999;

export type CentsResult = { ok: true; cents: number } | { ok: false };

/**
 * Parser ESTRICTO para el monto de un pago ENTRANTE. No confía en el frontend:
 * sólo dígitos, con hasta 2 decimales, sin signo, sin basura; > 0 y dentro del
 * rango de DECIMAL(12,2). Rechaza "", "0", negativos, NaN, Infinity, "100abc",
 * ">2 decimales", notación científica y overflow.
 */
export function parsePaymentAmountCents(raw: unknown): CentsResult {
  if (typeof raw !== "string") return { ok: false };
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
  const [intPart, decPart = ""] = s.split(".");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) {
    return { ok: false };
  }
  return { ok: true, cents };
}

/**
 * Lector TOLERANTE de un valor monetario YA GUARDADO (costos, amountPaid legacy).
 * Acepta number o string numérico (con más decimales por floats viejos) y
 * redondea a centavos. Devuelve 0 si el campo falta (undefined/null/"") y null
 * si está presente pero NO es un número finito válido.
 */
export function readStoredMoneyCents(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    if (!/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
    n = Number(value);
  } else return null;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export type ExactCents =
  | { ok: true; cents: number }
  // "ambiguous": numérico pero con precisión monetaria inesperada (>2 decimales
  // significativos o notación científica) → NO se redondea automáticamente.
  // "invalid": no es un número monetario legible / fuera de rango / negativo.
  | { ok: false; reason: "ambiguous" | "invalid" };

/**
 * Lector EXACTO y FAIL-CLOSED de un valor monetario guardado, para el CUTOVER
 * perezoso (congelar legacyPaidBase). A diferencia de readStoredMoneyCents, NO
 * redondea: sólo acepta valores cuya representación en centavos es INEQUÍVOCA
 * (a lo sumo 2 decimales significativos; los ceros a la derecha no cuentan, así
 * "1234.500" == 1234.50 se acepta). Todo lo demás:
 *  - >2 decimales significativos o notación científica → { ok:false, "ambiguous" }
 *  - basura / no numérico / negativo / fuera de rango  → { ok:false, "invalid" }
 * Campo ausente (undefined/null/"") → 0 (inequívoco: nada cobrado).
 * Trabaja sobre la representación en STRING (String() da la forma más corta con
 * round-trip), nunca sobre value*100 en float, para no reintroducir el error de
 * punto flotante que justamente se quiere evitar.
 */
export function readExactStoredMoneyCents(value: unknown): ExactCents {
  if (value === undefined || value === null || value === "") return { ok: true, cents: 0 };
  let s: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { ok: false, reason: "invalid" };
    s = String(value);
  } else if (typeof value === "string") {
    s = value.trim();
    if (s === "") return { ok: true, cents: 0 };
  } else {
    return { ok: false, reason: "invalid" };
  }
  if (/[eE]/.test(s)) return { ok: false, reason: "ambiguous" }; // notación científica
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return { ok: false, reason: "invalid" };
  const neg = m[1] === "-";
  const intPart = m[2];
  const dec = (m[3] ?? "").replace(/0+$/, ""); // decimales SIGNIFICATIVOS
  if (dec.length > 2) return { ok: false, reason: "ambiguous" };
  const cents = Number(intPart) * 100 + Number(dec.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_AMOUNT_CENTS) {
    return { ok: false, reason: "invalid" };
  }
  if (neg && cents !== 0) return { ok: false, reason: "invalid" }; // base negativa: no
  return { ok: true, cents };
}

/**
 * Lee una alícuota de IVA guardada. Devuelve null si falta o no es un número
 * finito >= 0 (no aplica todavía una allowlist fiscal de tasas: eso es posterior).
 */
export function readStoredRate(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
    n = Number(value);
  } else return null;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// Centavos → número decimal (para persistir/mostrar). El String() de JS usa la
// representación más corta con round-trip, así 3.33 se serializa "3.33".
export function centsToNumber(cents: number): number {
  return cents / 100;
}

// Centavos enteros → string decimal EXACTO con 2 decimales, por aritmética
// entera (sin float, sin toFixed como cálculo). Para escribir columnas
// DECIMAL(12,2) como jobs.legacyPaidBase.
export function centsToDecimalString(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${neg ? "-" : ""}${intPart}.${String(frac).padStart(2, "0")}`;
}
