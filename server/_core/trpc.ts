import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { extractTokenFromHeader, verifyIngemToken, type IngemTokenPayload } from "../ingemAuth";
import { canCreate, canEdit, canDelete } from "@shared/permissions";
import { getIngemUserById } from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ========== Manus OAuth protected procedure (original) ==========
const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ========== INGEM Internal Auth protected procedure ==========
const INGEM_UNAUTHED_MSG = "Sesión expirada. Por favor, inicie sesión nuevamente.";

// Usuario resuelto contra la base en cada request. El role/isActive/identidad
// provienen SIEMPRE de ingem_users, no del JWT.
export interface ResolvedIngemUser {
  userId: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  allowedModules: string | null;
}

/**
 * Fuente única de verdad de autenticación por request:
 *  1) verifica firma y expiración del JWT;
 *  2) toma el userId del token y consulta ingem_users por PK;
 *  3) si el usuario no existe o está inactivo -> UNAUTHORIZED;
 *  4) devuelve el usuario con su role ACTUAL de la base (el role del JWT se
 *     ignora para autorizar).
 * Es fail-closed: ante cualquier error al resolver, se deniega el acceso.
 */
async function resolveIngemUser(req: { headers: { authorization?: string } }): Promise<ResolvedIngemUser> {
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }
  const payload = await verifyIngemToken(token);
  if (!payload) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  let dbUser: Awaited<ReturnType<typeof getIngemUserById>>;
  try {
    dbUser = await getIngemUserById(payload.userId);
  } catch {
    // Fail-closed: si no se puede resolver al usuario (p. ej. DB caída), denegar.
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }
  if (!dbUser || dbUser.isActive === false) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  return {
    userId: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    isActive: dbUser.isActive,
    allowedModules: dbUser.allowedModules ?? null,
  };
}

const requireIngemUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  const ingemUser = await resolveIngemUser(ctx.req);
  return next({ ctx: { ...ctx, ingemUser } });
});

export const ingemProtectedProcedure = t.procedure.use(requireIngemUser);

// ========== INGEM role-based authorization ==========
// Autorización por rol en el servidor, usando la MISMA matriz que el frontend
// (shared/permissions). No agrega permisos: refleja lo que la UI ya permite.
const FORBIDDEN_MSG = "No tenés permisos para realizar esta acción.";

type PermCheck = (role: string, entity: string) => boolean;

// Middleware que exige token válido Y que el rol tenga el permiso indicado
// (create/edit/delete) sobre la entidad.
function requireIngemPermission(check: PermCheck, entity: string) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;
    const ingemUser = await resolveIngemUser(ctx.req);
    if (!check(ingemUser.role, entity)) {
      throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MSG });
    }
    return next({ ctx: { ...ctx, ingemUser } });
  });
}

// Fábricas de procedimientos por tipo de operación y entidad.
export const ingemCreateProcedure = (entity: string) =>
  t.procedure.use(requireIngemPermission(canCreate, entity));
export const ingemEditProcedure = (entity: string) =>
  t.procedure.use(requireIngemPermission(canEdit, entity));
export const ingemDeleteProcedure = (entity: string) =>
  t.procedure.use(requireIngemPermission(canDelete, entity));

// Acción especial: registrar cobro requiere editar 'jobs' Y crear 'transactions'
// (igual que la UI: canEditJobs && canCreateEntity('transactions')).
export const ingemRegisterPaymentProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const ingemUser = await resolveIngemUser(ctx.req);
    if (!(canEdit(ingemUser.role, "jobs") && canCreate(ingemUser.role, "transactions"))) {
      throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MSG });
    }
    return next({ ctx: { ...ctx, ingemUser } });
  }),
);

// INGEM admin-only procedure
const requireIngemAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;
  const ingemUser = await resolveIngemUser(ctx.req);
  if (ingemUser.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos de administrador." });
  }
  return next({ ctx: { ...ctx, ingemUser } });
});

export const ingemAdminProcedure = t.procedure.use(requireIngemAdmin);
