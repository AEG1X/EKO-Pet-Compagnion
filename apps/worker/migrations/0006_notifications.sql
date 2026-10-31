CREATE TABLE `notification_run` (
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`sent_at` integer NOT NULL,
	`summary` text NOT NULL,
	PRIMARY KEY(`owner_id`, `day`),
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_success_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscription_owner_idx` ON `push_subscription` (`owner_id`);--> statement-breakpoint
CREATE TABLE `telegram_link` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`chat_id` text,
	`link_code` text,
	`link_code_expires_at` integer,
	`linked_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
