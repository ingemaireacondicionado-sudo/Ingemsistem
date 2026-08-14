-- 8B-5 GATE GLOBAL DE COBRANZAS — tabla de controles de sistema (IDEMPOTENTE).
-- Diseñada para que, en producción, Manus cree system_controls MANUALMENTE con
-- ESTE MISMO SQL antes del release intermedio; y para que, cuando luego corra la
-- cadena normal 0009 → 0010 → 0011, esta migración encuentre la tabla ya existente
-- y NO altere el flag. Drizzle registra 0011 como aplicada por su hash aunque el
-- DDL resulte no-op (IF NOT EXISTS): la ejecución de los statements y el registro
-- del hash son independientes del efecto real.
CREATE TABLE IF NOT EXISTS `system_controls` (
	`controlKey` varchar(64) NOT NULL,
	`value` varchar(255) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_controls_controlKey` PRIMARY KEY(`controlKey`)
);
--> statement-breakpoint
-- Semilla IDEMPOTENTE: crea la fila del gate ABIERTA ('false') sólo si no existe.
-- ON DUPLICATE KEY no toca controlKey → NUNCA sobreescribe un estado ya presente
-- (si el gate estuviera activo, esta migración no lo reabre).
INSERT INTO `system_controls` (`controlKey`, `value`) VALUES ('payments_locked', 'false')
	ON DUPLICATE KEY UPDATE `controlKey` = `controlKey`;
