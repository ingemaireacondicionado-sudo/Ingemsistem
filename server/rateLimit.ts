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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Clave pseudonimizada: HMAC-SHA256 con el secreto del servidor. Ni la IP ni el
// email quedan en claro, y el hash no es reversible por tablas arcoíris.
function hashRateKey(value: string): string {
  return createHmac("sha256", ENV.cookieSecret || "").update(value).digest("hex");
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
 */
export async function isLoginRateLimited(ip: string, email: string): Promise<boolean> {
  return isLoginBlocked([ipRateKey(ip), ipEmailRateKey(ip, email)]);
}

/**
 * Registra un intento fallido: incrementa el contador por IP (máx 10) y por
 * IP+email (máx 5), cada uno con su umbral. Nunca recibe ni guarda la contraseña.
 */
export async function registerFailedLogin(ip: string, email: string): Promise<void> {
  await recordLoginFailure(ipRateKey(ip), WINDOW_MS, IP_MAX_ATTEMPTS, BLOCK_MS);
  await recordLoginFailure(ipEmailRateKey(ip, email), WINDOW_MS, IP_EMAIL_MAX_ATTEMPTS, BLOCK_MS);
  // Limpieza oportunista (no en cada request) para acotar el tamaño de la tabla.
  if (Math.random() < CLEANUP_PROBABILITY) {
    try {
      await cleanupExpiredLoginRateLimits(WINDOW_MS);
    } catch {
      // La limpieza es best-effort; nunca debe afectar el flujo de login.
    }
  }
}

/**
 * Login exitoso: limpia el contador IP+email (no consume cuota). El contador por
 * IP se deja intacto a propósito (puede reflejar ataques a otras cuentas).
 */
export async function registerSuccessfulLogin(ip: string, email: string): Promise<void> {
  await clearLoginRateKey(ipEmailRateKey(ip, email));
}
