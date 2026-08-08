ALTER TABLE `ingem_users` MODIFY COLUMN `password` varchar(255);--> statement-breakpoint
ALTER TABLE `ingem_users` ADD `passwordHash` varchar(255);