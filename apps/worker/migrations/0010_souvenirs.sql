CREATE TABLE `memory` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`file_id` text NOT NULL,
	`preview_file_id` text,
	`content_hash` text NOT NULL,
	`kind` text NOT NULL,
	`taken_date` text NOT NULL,
	`taken_time` text,
	`date_source` text NOT NULL,
	`caption` text,
	`favorite` integer DEFAULT false NOT NULL,
	`width` integer,
	`height` integer,
	`duration_seconds` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `stored_file`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preview_file_id`) REFERENCES `stored_file`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_file_id_unique` ON `memory` (`file_id`);--> statement-breakpoint
CREATE INDEX `memory_dog_date_idx` ON `memory` (`dog_id`,`taken_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `memory_dog_hash_idx` ON `memory` (`dog_id`,`content_hash`);