CREATE TABLE `page_views` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`referrer` text,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `page_views_created_idx` ON `page_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `page_views_path_idx` ON `page_views` (`path`);