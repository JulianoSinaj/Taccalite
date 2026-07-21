PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`image_label` text DEFAULT '' NOT NULL,
	`image` text,
	`published` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
INSERT INTO `__new_blog_posts`("id", "slug", "title", "date", "category", "excerpt", "content", "image_label", "image", "published", "sort_order", "created_at") SELECT "id", "slug", "title", "date", "category", "excerpt", "content", "image_label", "image", "published", "sort_order", "created_at" FROM `blog_posts`;--> statement-breakpoint
DROP TABLE `blog_posts`;--> statement-breakpoint
ALTER TABLE `__new_blog_posts` RENAME TO `blog_posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_slug_unique` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`to_address` text NOT NULL,
	`subject` text NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`sent_at` integer,
	CONSTRAINT "email_outbox_status_ck" CHECK("__new_email_outbox"."status" in ('queued', 'sent', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_email_outbox`("id", "to_address", "subject", "html", "text", "status", "error", "created_at", "sent_at") SELECT "id", "to_address", "subject", "html", "text", "status", "error", "created_at", "sent_at" FROM `email_outbox`;--> statement-breakpoint
DROP TABLE `email_outbox`;--> statement-breakpoint
ALTER TABLE `__new_email_outbox` RENAME TO `email_outbox`;--> statement-breakpoint
CREATE INDEX `email_outbox_status_idx` ON `email_outbox` (`status`);--> statement-breakpoint
CREATE TABLE `__new_loyalty_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`card_number` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "loyalty_points_ck" CHECK("__new_loyalty_accounts"."points" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_loyalty_accounts`("id", "user_id", "points", "card_number", "created_at") SELECT "id", "user_id", "points", "card_number", "created_at" FROM `loyalty_accounts`;--> statement-breakpoint
DROP TABLE `loyalty_accounts`;--> statement-breakpoint
ALTER TABLE `__new_loyalty_accounts` RENAME TO `loyalty_accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `loyalty_accounts_user_id_unique` ON `loyalty_accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `loyalty_accounts_card_number_unique` ON `loyalty_accounts` (`card_number`);--> statement-breakpoint
CREATE TABLE `__new_loyalty_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "loyalty_tx_balance_ck" CHECK("__new_loyalty_transactions"."balance_after" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_loyalty_transactions`("id", "user_id", "delta", "balance_after", "reason", "created_by_user_id", "created_at") SELECT "id", "user_id", "delta", "balance_after", "reason", "created_by_user_id", "created_at" FROM `loyalty_transactions`;--> statement-breakpoint
DROP TABLE `loyalty_transactions`;--> statement-breakpoint
ALTER TABLE `__new_loyalty_transactions` RENAME TO `loyalty_transactions`;--> statement-breakpoint
CREATE INDEX `loyalty_tx_user_idx` ON `loyalty_transactions` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_newsletter_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text NOT NULL,
	`source` text DEFAULT 'footer',
	`confirmed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	CONSTRAINT "newsletter_status_ck" CHECK("__new_newsletter_subscribers"."status" in ('pending', 'confirmed', 'unsubscribed'))
);
--> statement-breakpoint
INSERT INTO `__new_newsletter_subscribers`("id", "email", "status", "token", "source", "confirmed_at", "created_at") SELECT "id", "email", "status", "token", "source", "confirmed_at", "created_at" FROM `newsletter_subscribers`;--> statement-breakpoint
DROP TABLE `newsletter_subscribers`;--> statement-breakpoint
ALTER TABLE `__new_newsletter_subscribers` RENAME TO `newsletter_subscribers`;--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_email_unique` ON `newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE INDEX `newsletter_token_idx` ON `newsletter_subscribers` (`token`);--> statement-breakpoint
CREATE INDEX `newsletter_status_idx` ON `newsletter_subscribers` (`status`);--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`fulfilment` text DEFAULT 'pickup' NOT NULL,
	`shop_slug` text,
	`shipping_address` text,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'eur' NOT NULL,
	`payment_provider` text DEFAULT 'stripe',
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`stripe_session_id` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "orders_status_ck" CHECK("__new_orders"."status" in ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')),
	CONSTRAINT "orders_fulfilment_ck" CHECK("__new_orders"."fulfilment" in ('pickup', 'shipping')),
	CONSTRAINT "orders_payment_status_ck" CHECK("__new_orders"."payment_status" in ('unpaid', 'paid', 'refunded')),
	CONSTRAINT "orders_amounts_ck" CHECK("__new_orders"."subtotal_cents" >= 0 and "__new_orders"."shipping_cents" >= 0 and "__new_orders"."total_cents" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "order_number", "user_id", "email", "name", "phone", "status", "fulfilment", "shop_slug", "shipping_address", "subtotal_cents", "shipping_cents", "total_cents", "currency", "payment_provider", "payment_status", "stripe_session_id", "notes", "created_at", "updated_at") SELECT "id", "order_number", "user_id", "email", "name", "phone", "status", "fulfilment", "shop_slug", "shipping_address", "subtotal_cents", "shipping_cents", "total_cents", "currency", "payment_provider", "payment_status", "stripe_session_id", "notes", "created_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_shop_idx` ON `orders` (`shop_slug`);--> statement-breakpoint
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
	`purchasable` integer DEFAULT false NOT NULL,
	`stock` integer,
	`featured` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "products_price_ck" CHECK("__new_products"."price_cents" is null or "__new_products"."price_cents" >= 0),
	CONSTRAINT "products_stock_ck" CHECK("__new_products"."stock" is null or "__new_products"."stock" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "slug", "name", "shop_slug", "category", "description", "image_label", "image", "price_cents", "unit", "purchasable", "stock", "featured", "active", "sort_order", "created_at") SELECT "id", "slug", "name", "shop_slug", "category", "description", "image_label", "image", "price_cents", "unit", "purchasable", "stock", "featured", "active", "sort_order", "created_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_shop_idx` ON `products` (`shop_slug`);--> statement-breakpoint
CREATE TABLE `__new_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`reward_name` text NOT NULL,
	`points_spent` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`fulfilled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "redemptions_status_ck" CHECK("__new_redemptions"."status" in ('pending', 'fulfilled', 'cancelled')),
	CONSTRAINT "redemptions_points_ck" CHECK("__new_redemptions"."points_spent" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_redemptions`("id", "user_id", "reward_id", "reward_name", "points_spent", "status", "created_at", "fulfilled_at") SELECT "id", "user_id", "reward_id", "reward_name", "points_spent", "status", "created_at", "fulfilled_at" FROM `redemptions`;--> statement-breakpoint
DROP TABLE `redemptions`;--> statement-breakpoint
ALTER TABLE `__new_redemptions` RENAME TO `redemptions`;--> statement-breakpoint
CREATE INDEX `redemptions_user_idx` ON `redemptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `redemptions_status_idx` ON `redemptions` (`status`);--> statement-breakpoint
CREATE TABLE `__new_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`type` text DEFAULT 'table' NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`date` text NOT NULL,
	`time` text,
	`guests` integer,
	`quantity_kg` real,
	`shop_slug` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_notes` text,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reservations_type_ck" CHECK("__new_reservations"."type" in ('table', 'porchetta', 'order')),
	CONSTRAINT "reservations_status_ck" CHECK("__new_reservations"."status" in ('pending', 'confirmed', 'completed', 'cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_reservations`("id", "reference", "type", "name", "phone", "email", "date", "time", "guests", "quantity_kg", "shop_slug", "notes", "status", "admin_notes", "user_id", "created_at", "updated_at") SELECT "id", "reference", "type", "name", "phone", "email", "date", "time", "guests", "quantity_kg", "shop_slug", "notes", "status", "admin_notes", "user_id", "created_at", "updated_at" FROM `reservations`;--> statement-breakpoint
DROP TABLE `reservations`;--> statement-breakpoint
ALTER TABLE `__new_reservations` RENAME TO `reservations`;--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_reference_unique` ON `reservations` (`reference`);--> statement-breakpoint
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);--> statement-breakpoint
CREATE INDEX `reservations_date_idx` ON `reservations` (`date`);--> statement-breakpoint
CREATE INDEX `reservations_user_idx` ON `reservations` (`user_id`);--> statement-breakpoint
CREATE INDEX `reservations_shop_idx` ON `reservations` (`shop_slug`);--> statement-breakpoint
CREATE INDEX `reservations_cron_idx` ON `reservations` (`type`,`status`,`date`);--> statement-breakpoint
CREATE TABLE `__new_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`points` integer NOT NULL,
	`image` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	CONSTRAINT "rewards_points_ck" CHECK("__new_rewards"."points" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_rewards`("id", "slug", "name", "description", "points", "image", "active", "sort_order", "created_at") SELECT "id", "slug", "name", "description", "points", "image", "active", "sort_order", "created_at" FROM `rewards`;--> statement-breakpoint
DROP TABLE `rewards`;--> statement-breakpoint
ALTER TABLE `__new_rewards` RENAME TO `rewards`;--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_slug_unique` ON `rewards` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "user_id", "expires_at", "created_at") SELECT "id", "user_id", "expires_at", "created_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("key", "value", "updated_at") SELECT "key", "value", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
CREATE TABLE `__new_shops` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`specialty` text NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`address_confirmed` integer DEFAULT true NOT NULL,
	`hours` text DEFAULT '[]' NOT NULL,
	`hours_confirmed` integer DEFAULT true NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`highlights` text DEFAULT '[]' NOT NULL,
	`image_label` text DEFAULT '' NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`porchetta_enabled` integer DEFAULT true NOT NULL,
	`store_enabled` integer DEFAULT true NOT NULL,
	`reservations_enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
INSERT INTO `__new_shops`("id", "slug", "name", "specialty", "tagline", "description", "address", "address_confirmed", "hours", "hours_confirmed", "phone", "email", "highlights", "image_label", "image", "sort_order", "created_at") SELECT "id", "slug", "name", "specialty", "tagline", "description", "address", "address_confirmed", "hours", "hours_confirmed", "phone", "email", "highlights", "image_label", "image", "sort_order", "created_at" FROM `shops`;--> statement-breakpoint
DROP TABLE `shops`;--> statement-breakpoint
ALTER TABLE `__new_shops` RENAME TO `shops`;--> statement-breakpoint
CREATE UNIQUE INDEX `shops_slug_unique` ON `shops` (`slug`);--> statement-breakpoint
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
	`created_at` integer DEFAULT (unixepoch() * 1000),
	CONSTRAINT "users_role_ck" CHECK("__new_users"."role" in ('customer', 'staff', 'admin'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "email", "name", "password_hash", "phone", "role", "marketing_consent", "email_verified_at", "created_at") SELECT "id", "username", "email", "name", "password_hash", "phone", "role", "marketing_consent", "email_verified_at", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `__new_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`product_slug` text,
	`name` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_items_amounts_ck" CHECK("__new_order_items"."unit_price_cents" >= 0 and "__new_order_items"."line_total_cents" >= 0 and "__new_order_items"."quantity" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_order_items`("id", "order_id", "product_id", "product_slug", "name", "unit_price_cents", "quantity", "line_total_cents") SELECT "id", "order_id", "product_id", "product_slug", "name", "unit_price_cents", "quantity", "line_total_cents" FROM `order_items`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);