ALTER TABLE `products` ADD `low_stock_notified_at` integer;--> statement-breakpoint
ALTER TABLE `reservations` ADD `waitlisted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `ready_at` integer;