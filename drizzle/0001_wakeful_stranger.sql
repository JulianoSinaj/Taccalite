PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`name` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`email_verified_at` integer,
	`created_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "email", "name", "password_hash", "phone", "role", "marketing_consent", "email_verified_at", "created_at") SELECT "id", "id", "email", "name", "password_hash", "phone", "role", "marketing_consent", "email_verified_at", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);