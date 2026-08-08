import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

const SECRET_KEY = new TextEncoder().encode(ENV.cookieSecret || "ingem-fallback-secret-key-2024");
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
