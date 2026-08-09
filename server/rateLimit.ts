import { createHmac } from "crypto";
import { ENV } from "./_core/env";
import {
  isLoginBlocked,
  recordLoginFailure,
  clearLoginRateKey,
  cleanupExpiredLoginRateLimits,
} from "./db";

// ===== Política de limitación de login =====
export const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
export const BLOCK_MS = 15 * 60 * 1000; // bloqueo de 15 minutos
export const IP_MAX_ATTEMPTS = 10; // por IP: 10 fallos / 15 min
export const IP_EMAIL_MAX_ATTEMPTS = 5; // por IP+email: 5 fallos / 15 min

// Mensaje genérico (no revela si el email existe ni el motivo exacto).
export const RATE_LIMIT_MESSAGE = "Demasiados intentos. Probá nuevamente en unos minutos.";

// Probabilidad de disparar limpieza oportunista en un intento fallido.
const CLEANUP_PROBABILITY = 0.05;

// Clave HMAC dedicada al rate limiter, DERIVADA del secreto del servidor con
// separación de dominio: no se usa JWT_SECRET directamente para las rateKeys.
const RATE_LIMIT_HMAC_KEY = createHmac("sha256", ENV.cookieSecret || "")
  .update("ingem-login-rate-limit-key/v1")
  .digest();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Clave pseudonimizada: HMAC-SHA256 con la clave derivada. Ni la IP ni el email
// quedan en claro, y el hash no es reversible por tablas arcoíris.
function hashRateKey(value: string): string {
  return createHmac("sha256", RATE_LIMIT_HMAC_KEY).update(value).digest("hex");
}

export function ipRateKey(ip: string): string {
  return hashRateKey(`ip:${ip}`);
}
export function ipEmailRateKey(ip: string, email: string): string {
  return hashRateKey(`ipemail:${ip}|${normalizeEmail(email)}`);
}

/**
 * ¿El login está bloqueado para esta IP o esta combinación IP+email?
 * Se consulta ANTES de verificar credenciales.
 *
 * FAIL-OPEN para el limitador: si la consulta falla (tabla inexistente, timeout,
 * error de DB), se devuelve `false` y el login CONTINÚA hacia la verificación de
 * contraseña. Un error del limitador NUNCA deja entrar sin contraseña (la
 * contraseña se sigue verificando) NI bloquea el acceso legítimo.
 */
export async function isLoginRateLimited(ip: string, email: string): Promise<boolean> {
  try {
    return await isLoginBlocked([ipRateKey(ip), ipEmailRateKey(ip, email)]);
  } catch {
    return false;
  }
}

/**
 * Registra un intento fallido: incrementa el contador por IP (máx 10) y por
 * IP+email (máx 5). Nunca recibe ni guarda la contraseña. Best-effort: cualquier
 * error se ignora para no afectar la respuesta del login.
 */
export async function registerFailedLogin(ip: string, email: string): Promise<void> {
  try {
    await recordLoginFailure(ipRateKey(ip), WINDOW_MS, IP_MAX_ATTEMPTS, BLOCK_MS);
    await recordLoginFailure(ipEmailRateKey(ip, email), WINDOW_MS, IP_EMAIL_MAX_ATTEMPTS, BLOCK_MS);
    // Limpieza oportunista (no en cada request) para acotar el tamaño de la tabla.
    if (Math.random() < CLEANUP_PROBABILITY) {
      await cleanupExpiredLoginRateLimits(WINDOW_MS);
    }
  } catch {
    // best-effort: un error del limitador no debe romper el flujo de login.
  }
}

/**
 * Login exitoso: limpia el contador IP+email (no consume cuota). El contador por
 * IP se deja intacto a propósito (puede reflejar ataques a otras cuentas).
 * Best-effort: un error de limpieza nunca debe impedir un login legítimo.
 */
export async function registerSuccessfulLogin(ip: string, email: string): Promise<void> {
  try {
    await clearLoginRateKey(ipEmailRateKey(ip, email));
  } catch {
    // best-effort
  }
}
