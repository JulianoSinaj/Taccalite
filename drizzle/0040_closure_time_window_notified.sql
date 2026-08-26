PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shop_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_slug` text,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`blocks_reservations` integer DEFAULT true NOT NULL,
	`blocks_pickup` integer DEFAULT true NOT NULL,
	`start_time` text,
	`end_time` text,
	`notified_at` integer,
	`notified_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "shop_closures_range_ck" CHECK("__new_shop_closures"."to_date" >= "__new_shop_closures"."from_date"),
	CONSTRAINT "shop_closures_date_ck" CHECK("__new_shop_closures"."from_date" like '____-__-__' and "__new_shop_closures"."to_date" like '____-__-__'),
	CONSTRAINT "shop_closures_time_ck" CHECK(("__new_shop_closures"."start_time" is null and "__new_shop_closures"."end_time" is null) or ("__new_shop_closures"."start_time" like '__:__' and "__new_shop_closures"."end_time" like '__:__' and "__new_shop_closures"."end_time" > "__new_shop_closures"."start_time"))
);
--> statement-breakpoint
INSERT INTO `__new_shop_closures`("id", "shop_slug", "from_date", "to_date", "reason", "blocks_reservations", "blocks_pickup", "start_time", "end_time", "notified_at", "notified_count", "created_at") SELECT "id", "shop_slug", "from_date", "to_date", "reason", "blocks_reservations", "blocks_pickup", NULL, NULL, NULL, 0, "created_at" FROM `shop_closures`;--> statement-breakpoint
DROP TABLE `shop_closures`;--> statement-breakpoint
ALTER TABLE `__new_shop_closures` RENAME TO `shop_closures`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `shop_closures_range_idx` ON `shop_closures` (`from_date`,`to_date`);--> statement-breakpoint
CREATE INDEX `shop_closures_shop_idx` ON `shop_closures` (`shop_slug`,`from_date`);
