-- 8B-5a — schema aditivo del ledger de cobros. Sólo AGREGA dos columnas; no
-- modifica ni migra datos existentes. Segura de aplicar en caliente.
--  * jobs.legacyPaidBase: DECIMAL(12,2) NULLABLE (sin default) → todos los jobs
--    existentes quedan NULL = "aún no migrado al modelo canónico". El cutover
--    (8B-5c) la congelará una vez desde el amountPaid válido. Server-controlled.
--  * transactions.isJobPayment: BOOLEAN NOT NULL DEFAULT false → todas las
--    transactions históricas quedan en false (no se reinterpretan como cobro).
--    Sólo registerPayment (8B-5c) la pondrá en true; el CRUD genérico la fuerza
--    a false y no puede editar/eliminar filas marcadas.
-- Sin backfill. Sin índices en esta etapa (el SUM llega en 8B-5c).
ALTER TABLE `jobs` ADD `legacyPaidBase` decimal(12,2);--> statement-breakpoint
ALTER TABLE `transactions` ADD `isJobPayment` boolean DEFAULT false NOT NULL;