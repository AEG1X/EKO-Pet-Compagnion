CREATE TABLE `finder_report` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`message` text,
	`contact` text,
	`latitude` real,
	`longitude` real,
	`accuracy` real,
	FOREIGN KEY (`episode_id`) REFERENCES `lost_episode`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `finder_report_episode_idx` ON `finder_report` (`episode_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `lost_episode` (
	`id` text PRIMARY KEY NOT NULL,
	`dog_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`message` text,
	`report_count` integer DEFAULT 0 NOT NULL,
	`purged_at` integer,
	`last_scan_alert_at` integer,
	FOREIGN KEY (`dog_id`) REFERENCES `dog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lost_episode_dog_idx` ON `lost_episode` (`dog_id`,`started_at`);