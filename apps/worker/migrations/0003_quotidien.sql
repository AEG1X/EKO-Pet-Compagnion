CREATE TABLE `expense` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`health_event_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_event`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expense_dog_date_idx` ON `expense` (`dog_id`,`date`);--> statement-breakpoint
CREATE TABLE `feeding_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`food` text NOT NULL,
	`daily_grams` integer,
	`meals_per_day` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feeding_plan_dog_idx` ON `feeding_plan` (`dog_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `training_session` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`date` text NOT NULL,
	`duration_minutes` integer,
	`skill_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `training_skill`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `training_session_dog_idx` ON `training_session` (`dog_id`,`date`);--> statement-breakpoint
CREATE TABLE `training_skill` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`acquired_date` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `training_skill_dog_idx` ON `training_skill` (`dog_id`);