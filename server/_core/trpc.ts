import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { extractTokenFromHeader, verifyIngemToken, type IngemTokenPayload } from "../ingemAuth";
import { canCreate, canEdit, canDelete } from "@shared/permissions";

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

const requireIngemUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  const authHeader = ctx.req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  const ingemUser = await verifyIngemToken(token);
  if (!ingemUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      ingemUser,
    },
  });
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
    const token = extractTokenFromHeader(ctx.req.headers.authorization);
    if (!token) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
    }
    const ingemUser = await verifyIngemToken(token);
    if (!ingemUser) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
    }
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
    const token = extractTokenFromHeader(ctx.req.headers.authorization);
    if (!token) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
    }
    const ingemUser = await verifyIngemToken(token);
    if (!ingemUser) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
    }
    if (!(canEdit(ingemUser.role, "jobs") && canCreate(ingemUser.role, "transactions"))) {
      throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MSG });
    }
    return next({ ctx: { ...ctx, ingemUser } });
  }),
);

// INGEM admin-only procedure
const requireIngemAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  const authHeader = ctx.req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  const ingemUser = await verifyIngemToken(token);
  if (!ingemUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  if (ingemUser.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos de administrador." });
  }

  return next({
    ctx: {
      ...ctx,
      ingemUser,
    },
  });
});

export const ingemAdminProcedure = t.procedure.use(requireIngemAdmin);
