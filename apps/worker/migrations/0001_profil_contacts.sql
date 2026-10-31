CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`organization` text,
	`phone` text,
	`email` text,
	`address` text,
	`notes` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_dog_idx` ON `contact` (`dog_id`);--> statement-breakpoint
CREATE TABLE `dog` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`breed` text,
	`sex` text,
	`birth_date` text,
	`neutered` integer,
	`coat` text,
	`chip_number` text,
	`passport_number` text,
	`address` text,
	`area` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dog_owner_idx` ON `dog` (`owner_id`);