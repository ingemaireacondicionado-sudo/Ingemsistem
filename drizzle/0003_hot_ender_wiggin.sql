ALTER TABLE `notes` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `notes` ADD `customerName` varchar(200) DEFAULT '';--> statement-breakpoint
ALTER TABLE `notes` ADD `documentType` enum('none','budget','invoice') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `documentNumber` varchar(100) DEFAULT '';