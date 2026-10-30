CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`event` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `auth_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`challenge` text NOT NULL,
	`owner_id` text,
	`payload` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`webauthn_user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_owner_idx` ON `passkey` (`owner_id`);--> statement-breakpoint
CREATE TABLE `pin` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recovery_code` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_code_code_hash_unique` ON `recovery_code` (`code_hash`);--> statement-breakpoint
CREATE INDEX `recovery_owner_idx` ON `recovery_code` (`owner_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`unlocked_at` integer,
	`user_agent` text,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_owner_idx` ON `session` (`owner_id`);--> statement-breakpoint
CREATE INDEX `session_expires_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`theme` text NOT NULL,
	`accent` text NOT NULL,
	`section_order` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
