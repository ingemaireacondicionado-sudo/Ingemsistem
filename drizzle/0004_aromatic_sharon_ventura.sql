ALTER TABLE `appointments` ADD `recurrenceType` varchar(20) DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `appointments` ADD `recurrenceEndDate` varchar(20);--> statement-breakpoint
ALTER TABLE `appointments` ADD `parentAppointmentId` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `recurrenceGroupId` varchar(50);--> statement-breakpoint
ALTER TABLE `appointments` ADD `completionNotes` text;--> statement-breakpoint
ALTER TABLE `appointments` ADD `completedBy` varchar(100);--> statement-breakpoint
ALTER TABLE `appointments` ADD `completedAt` timestamp;