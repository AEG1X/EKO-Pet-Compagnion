CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`file_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`health_event_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `stored_file`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_event`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `document_dog_date_idx` ON `document` (`dog_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_file_idx` ON `document` (`file_id`);--> statement-breakpoint
CREATE TABLE `stored_file` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`name` text,
	`purpose` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stored_file_owner_idx` ON `stored_file` (`owner_id`,`purpose`);--> statement-breakpoint
ALTER TABLE `dog` ADD `photo_file_id` text REFERENCES stored_file(id) ON DELETE set null;