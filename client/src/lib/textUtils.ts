/**
 * Normaliza un string para búsqueda: lowercase + quita acentos/diacríticos.
 * Permite buscar "tecnico" y encontrar "Técnico", etc.
 */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
