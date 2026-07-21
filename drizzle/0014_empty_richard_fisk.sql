CREATE TABLE `stock_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`notified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stock_notif_product_idx` ON `stock_notifications` (`product_id`,`notified_at`);