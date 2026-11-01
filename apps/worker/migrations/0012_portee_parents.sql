CREATE TABLE `dog_parent` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`affix` text,
	`breed` text,
	`birth_date` text,
	`coat` text,
	`registration` text,
	`chip_number` text,
	`pedigree_url` text,
	`titles` text,
	`notes` text,
	`photo_file_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_file_id`) REFERENCES `stored_file`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dog_parent_role_idx` ON `dog_parent` (`dog_id`,`role`);--> statement-breakpoint
CREATE TABLE `litter` (
	`dog_id` text PRIMARY KEY NOT NULL,
	`mating_date` text,
	`mating_approx` integer DEFAULT false NOT NULL,
	`ultrasound_result` text,
	`home_date` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `parent_health_test` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`name` text NOT NULL,
	`result` text,
	`date` text,
	`lab` text,
	`document_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `dog_parent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `parent_health_test_parent_idx` ON `parent_health_test` (`parent_id`);