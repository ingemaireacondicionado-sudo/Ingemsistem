import bcrypt from "bcryptjs";

// Costo de bcrypt. 10 es un equilibrio razonable entre seguridad y velocidad
// para una app de este tamaño.
const SALT_ROUNDS = 10;

/**
 * Genera un hash bcrypt seguro para una contraseña en texto plano.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Verifica una contraseña en texto plano contra un hash bcrypt.
 * Devuelve false ante cualquier error o hash vacío (nunca lanza).
 */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string | null | undefined
): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch {
    return false;
  }
}

/**
 * Indica si un valor almacenado ya es un hash bcrypt (prefijos $2a$/$2b$/$2y$).
 * Útil para no re-hashear ni tratar un hash como texto plano.
 */
export function looksLikeBcryptHash(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\$2[aby]\$\d{2}\$/.test(value);
}
