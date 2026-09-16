-- AGENTES DE GESTIÓN — corridas y decisiones propuestas.
-- Migración puramente ADITIVA: crea dos tablas nuevas y no altera ninguna
-- existente. Nada de lo que vive acá es dinero: `agent_decisions` guarda lo que
-- un agente PROPONE y quién lo aprobó; el ledger de cobros sigue intacto en
-- `transactions` con su gate y su marca server-controlled.
-- DDL idempotente (IF NOT EXISTS), igual que 0011, para tolerar una creación
-- manual previa en producción.
CREATE TABLE IF NOT EXISTS `agent_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`agentKey` varchar(50) NOT NULL,
	`title` varchar(200) NOT NULL,
	`rationale` text,
	`recommendation` text,
	`agentPriority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`evidenceJson` text,
	`entityType` varchar(50) DEFAULT '',
	`entityId` int,
	`actionType` varchar(50) NOT NULL DEFAULT 'review_only',
	`actionPayloadJson` text,
	`agentDecisionStatus` enum('pending','approved','rejected','executed','failed') NOT NULL DEFAULT 'pending',
	`decidedBy` int,
	`decidedByName` varchar(100) DEFAULT '',
	`decidedAt` timestamp,
	`decisionNotes` varchar(500) DEFAULT '',
	`executionResult` varchar(500) DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentKey` varchar(50) NOT NULL,
	`agentRunStatus` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`triggeredBy` int,
	`triggeredByName` varchar(100) DEFAULT '',
	`summary` text,
	`error` varchar(500) DEFAULT '',
	`model` varchar(100) DEFAULT '',
	`factsJson` text,
	`decisionCount` int NOT NULL DEFAULT 0,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `agent_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_decisions_status` ON `agent_decisions` (`agentDecisionStatus`,`agentKey`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_decisions_run` ON `agent_decisions` (`runId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_runs_agent_started` ON `agent_runs` (`agentKey`,`startedAt`);
