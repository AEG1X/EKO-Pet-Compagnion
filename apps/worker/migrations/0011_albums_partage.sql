CREATE TABLE `album` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_memory_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cover_memory_id`) REFERENCES `memory`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `album_dog_idx` ON `album` (`dog_id`);--> statement-breakpoint
CREATE TABLE `album_memory` (
	`album_id` text NOT NULL,
	`memory_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`album_id`, `memory_id`),
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memory_id`) REFERENCES `memory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `album_memory_memory_idx` ON `album_memory` (`memory_id`);--> statement-breakpoint
CREATE TABLE `memory_reminder_settings` (
	`dog_id` text PRIMARY KEY NOT NULL,
	`birthday` integer NOT NULL,
	`monthly` integer NOT NULL,
	`on_this_day` integer NOT NULL,
	`special_dates` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `share_link` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`token` text NOT NULL,
	`label` text NOT NULL,
	`allow_download` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`last_viewed_at` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_link_token_unique` ON `share_link` (`token`);--> statement-breakpoint
CREATE INDEX `share_link_album_idx` ON `share_link` (`album_id`);--> statement-breakpoint
CREATE TABLE `special_date` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `special_date_dog_idx` ON `special_date` (`dog_id`);