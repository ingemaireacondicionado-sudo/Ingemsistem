-- Migración ADITIVA: crea la tabla de almacenamiento privado de archivos.
-- No modifica ni elimina tablas/columnas existentes. Segura de aplicar en
-- caliente. `data` es MEDIUMBLOB (hasta 16 MB); los límites de negocio son
-- 8 MB (PDF) / 5 MB (imágenes), validados en el servidor.
CREATE TABLE `private_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`sizeBytes` int NOT NULL,
	`data` mediumblob NOT NULL,
	`category` enum('purchase_order','invoice','technician_document') NOT NULL,
	`entityType` varchar(50),
	`entityId` int,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `private_files_id` PRIMARY KEY(`id`)
);
