/**
 * Utilidades de fecha que usan hora LOCAL en lugar de UTC.
 * Esto evita el bug donde toISOString() devuelve el día anterior
 * cuando el usuario está en una zona horaria negativa (ej: Argentina UTC-3).
 */

/**
 * Formatea una fecha como "YYYY-MM-DD" usando la hora LOCAL del usuario.
 * Reemplaza el patrón problemático: date.toISOString().split('T')[0]
 */
export function toLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Obtiene la fecha de hoy como "YYYY-MM-DD" en hora local.
 */
export function todayStr(): string {
  return toLocalDateStr(new Date());
}

/**
 * Obtiene la fecha de mañana como "YYYY-MM-DD" en hora local.
 */
export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}

/**
 * Obtiene el primer día del mes actual como "YYYY-MM-DD" en hora local.
 */
export function firstDayOfMonthStr(): string {
  const d = new Date();
  return toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * Convierte un timestamp (Date o string ISO) a "YYYY-MM-DD" en hora local.
 * Útil para convertir createdAt/updatedAt del servidor.
 */
export function timestampToLocalDateStr(val: string | Date | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return toLocalDateStr(d);
}

/**
 * Parsea un string "YYYY-MM-DD" como fecha local (sin problemas de timezone).
 * new Date("2026-02-26") se interpreta como UTC, lo cual puede dar el día anterior.
 * Esta función lo parsea correctamente como fecha local.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Suma días a una fecha en formato "YYYY-MM-DD" y devuelve el resultado en el mismo formato.
 */
export function addDaysLocal(dateStr: string, days: number): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return toLocalDateStr(date);
}

/**
 * Formatea una fecha "YYYY-MM-DD" al formato argentino (dd/mm/yyyy).
 */
export function formatDateAr(dateStr?: string): string {
  if (!dateStr) return '-';
  return parseLocalDate(dateStr).toLocaleDateString('es-AR');
}

/**
 * Calcula los días transcurridos desde una fecha "YYYY-MM-DD" hasta hoy.
 */
export function daysSinceLocal(dateStr: string): number {
  const start = parseLocalDate(dateStr).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}
