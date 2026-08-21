CREATE TABLE `site_content` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_by_user_id` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000)
);
