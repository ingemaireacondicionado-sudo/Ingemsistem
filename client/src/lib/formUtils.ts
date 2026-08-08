export function parseAmountInput(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseNonNegativeAmount(value: string | number | null | undefined): number {
  return Math.max(parseAmountInput(value), 0);
}

export function parseOptionalNonNegativeAmount(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  return parseNonNegativeAmount(value);
}

export function parsePositiveInteger(value: string | number | null | undefined): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCuitFormat(value: string): boolean {
  return /^\d{2}-?\d{8}-?\d$/.test(value.trim());
}
