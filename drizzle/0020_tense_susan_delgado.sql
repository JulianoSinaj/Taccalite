CREATE TABLE `newsletter_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`segment` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_for` integer,
	`sent_at` integer,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `newsletter_campaigns` (`status`);--> statement-breakpoint
CREATE INDEX `campaigns_due_idx` ON `newsletter_campaigns` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `campaigns_created_idx` ON `newsletter_campaigns` (`created_at`);