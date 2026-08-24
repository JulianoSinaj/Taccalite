CREATE TABLE `shop_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_slug` text,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`blocks_reservations` integer DEFAULT true NOT NULL,
	`blocks_pickup` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "shop_closures_range_ck" CHECK("shop_closures"."to_date" >= "shop_closures"."from_date"),
	CONSTRAINT "shop_closures_date_ck" CHECK("shop_closures"."from_date" like '____-__-__' and "shop_closures"."to_date" like '____-__-__')
);
--> statement-breakpoint
CREATE INDEX `shop_closures_range_idx` ON `shop_closures` (`from_date`,`to_date`);--> statement-breakpoint
CREATE INDEX `shop_closures_shop_idx` ON `shop_closures` (`shop_slug`,`from_date`);