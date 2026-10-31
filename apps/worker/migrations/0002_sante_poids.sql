CREATE TABLE `health_event` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`contact_id` text,
	`next_due_date` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `health_event_dog_date_idx` ON `health_event` (`dog_id`,`date`);--> statement-breakpoint
CREATE INDEX `health_event_due_idx` ON `health_event` (`dog_id`,`next_due_date`);--> statement-breakpoint
CREATE TABLE `treatment` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`name` text NOT NULL,
	`dosage` text,
	`frequency` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `treatment_dog_idx` ON `treatment` (`dog_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `weight_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`date` text NOT NULL,
	`grams` integer NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_dog_date_idx` ON `weight_entry` (`dog_id`,`date`);