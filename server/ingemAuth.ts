import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

/**
 * Validación única del secreto de firma JWT. JWT_SECRET es OBLIGATORIO: no
 * existe ningún valor por defecto. Si falta o está vacío, se lanza un error
 * (nunca se imprime el valor del secreto). Se usa al cargar el módulo, de modo
 * que el servidor falla al iniciar si JWT_SECRET no está configurado.
 */
export function assertJwtSecret(secret: string | undefined | null): asserts secret is string {
  if (!secret || secret.trim() === "") {
    throw new Error("JWT_SECRET is required");
  }
}

assertJwtSecret(ENV.cookieSecret);
const SECRET_KEY = new TextEncoder().encode(ENV.cookieSecret);
const TOKEN_EXPIRY = "7d"; // 7 days

export interface IngemTokenPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
}

/**
 * Generate a JWT token for an authenticated INGEM user
 */
export async function generateIngemToken(payload: IngemTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(SECRET_KEY);
}

/**
 * Verify and decode an INGEM JWT token
 */
export async function verifyIngemToken(token: string): Promise<IngemTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header
 * Supports: "Bearer <token>" or just "<token>"
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return authHeader;
}
