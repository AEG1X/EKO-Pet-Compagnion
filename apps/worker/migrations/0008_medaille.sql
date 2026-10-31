CREATE TABLE `medal` (
	`dog_id` text PRIMARY KEY NOT NULL,
	`public_id` text,
	`settings` text NOT NULL,
	`snapshot_hash` text,
	`created_at` integer,
	`last_scan_at` integer,
	`scan_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `medal_public_id_unique` ON `medal` (`public_id`);