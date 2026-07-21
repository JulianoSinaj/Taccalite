CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_name` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`entity` text DEFAULT '' NOT NULL,
	`entity_id` text,
	`summary` text DEFAULT '' NOT NULL,
	`meta` text,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity`,`entity_id`);