-- Hace nullable la columna password legado (no borra ni trunca datos: MODIFY
-- conserva los valores existentes; solo se elimina la restricción NOT NULL).
ALTER TABLE `ingem_users` MODIFY COLUMN `password` varchar(255) NULL;--> statement-breakpoint
-- Agrega la nueva columna de hash, nullable (los usuarios existentes quedan con
-- passwordHash = NULL hasta que se migren).
ALTER TABLE `ingem_users` ADD `passwordHash` varchar(255) NULL;
