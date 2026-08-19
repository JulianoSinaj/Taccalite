CREATE TABLE `customer_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`rule` text DEFAULT '{}' NOT NULL,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `segments_name_idx` ON `customer_segments` (`name`);--> statement-breakpoint
CREATE TABLE `discount_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`discount_code` text NOT NULL,
	`order_id` text,
	`user_id` text,
	`email` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `discount_redemptions_code_idx` ON `discount_redemptions` (`discount_code`);--> statement-breakpoint
CREATE INDEX `discount_redemptions_user_idx` ON `discount_redemptions` (`discount_code`,`user_id`);--> statement-breakpoint
CREATE INDEX `discount_redemptions_email_idx` ON `discount_redemptions` (`discount_code`,`email`);--> statement-breakpoint
CREATE INDEX `discount_redemptions_order_idx` ON `discount_redemptions` (`order_id`);--> statement-breakpoint
CREATE TABLE `product_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`lot_code` text DEFAULT '' NOT NULL,
	`expiry_date` text,
	`quantity` integer DEFAULT 0 NOT NULL,
	`remaining` integer DEFAULT 0 NOT NULL,
	`supplier` text,
	`unit_cost_cents` integer,
	`received_at` integer,
	`note` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `batches_product_idx` ON `product_batches` (`product_id`);--> statement-breakpoint
CREATE INDEX `batches_expiry_idx` ON `product_batches` (`expiry_date`);--> statement-breakpoint
CREATE INDEX `batches_product_expiry_idx` ON `product_batches` (`product_id`,`expiry_date`);--> statement-breakpoint
CREATE TABLE `saved_views` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_views_user_path_idx` ON `saved_views` (`user_id`,`path`);--> statement-breakpoint
ALTER TABLE `discount_codes` ADD `max_per_customer` integer;--> statement-breakpoint
ALTER TABLE `discount_codes` ADD `first_order_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `discount_codes` ADD `shop_slug` text;--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `campaign_id` text;--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `claimed_at` integer;--> statement-breakpoint
CREATE INDEX `email_outbox_campaign_idx` ON `email_outbox` (`campaign_id`);--> statement-breakpoint
ALTER TABLE `newsletter_campaigns` ADD `segment_id` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `weight_kg` real;--> statement-breakpoint
ALTER TABLE `order_items` ADD `price_overridden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `refunded_at` integer;--> statement-breakpoint
CREATE INDEX `orders_refunded_at_idx` ON `orders` (`refunded_at`);--> statement-breakpoint
ALTER TABLE `products` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `reservations` ADD `table_number` text;--> statement-breakpoint
ALTER TABLE `rewards` ADD `stock` integer;--> statement-breakpoint
ALTER TABLE `rewards` ADD `max_per_customer` integer;--> statement-breakpoint
ALTER TABLE `rewards` ADD `available_from` integer;--> statement-breakpoint
ALTER TABLE `rewards` ADD `available_until` integer;--> statement-breakpoint
ALTER TABLE `shops` ADD `hours_structured` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `porchetta_capacity_kg` integer;--> statement-breakpoint
ALTER TABLE `shops` ADD `seats_capacity` integer;