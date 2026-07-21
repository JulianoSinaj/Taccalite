ALTER TABLE `order_items` ADD `vat_rate_bps` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`shop_slug` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_label` text DEFAULT '' NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`price_cents` integer,
	`unit` text,
	`vat_rate_bps` integer DEFAULT 1000 NOT NULL,
	`sold_by_weight` integer DEFAULT false NOT NULL,
	`allergens` text DEFAULT '[]' NOT NULL,
	`origin` text,
	`ingredients` text,
	`purchasable` integer DEFAULT false NOT NULL,
	`stock` integer,
	`low_stock_notified_at` integer,
	`featured` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "products_price_ck" CHECK("__new_products"."price_cents" is null or "__new_products"."price_cents" >= 0),
	CONSTRAINT "products_stock_ck" CHECK("__new_products"."stock" is null or "__new_products"."stock" >= 0),
	CONSTRAINT "products_vat_ck" CHECK("__new_products"."vat_rate_bps" >= 0 and "__new_products"."vat_rate_bps" <= 10000)
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "slug", "name", "shop_slug", "category", "description", "image_label", "image", "price_cents", "unit", "vat_rate_bps", "sold_by_weight", "allergens", "origin", "ingredients", "purchasable", "stock", "low_stock_notified_at", "featured", "active", "sort_order", "created_at") SELECT "id", "slug", "name", "shop_slug", "category", "description", "image_label", "image", "price_cents", "unit", 1000, false, '[]', NULL, NULL, "purchasable", "stock", "low_stock_notified_at", "featured", "active", "sort_order", "created_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_shop_idx` ON `products` (`shop_slug`);
