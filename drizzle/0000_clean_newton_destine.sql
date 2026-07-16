CREATE TABLE `blog_posts` (
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
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_slug_unique` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`to_address` text NOT NULL,
	`subject` text NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` integer,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `email_outbox_status_idx` ON `email_outbox` (`status`);--> statement-breakpoint
CREATE TABLE `loyalty_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`card_number` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loyalty_accounts_user_id_unique` ON `loyalty_accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `loyalty_accounts_card_number_unique` ON `loyalty_accounts` (`card_number`);--> statement-breakpoint
CREATE TABLE `loyalty_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_by_user_id` text,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `loyalty_tx_user_idx` ON `loyalty_transactions` (`user_id`);--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text NOT NULL,
	`source` text DEFAULT 'footer',
	`confirmed_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_email_unique` ON `newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`product_slug` text,
	`name` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
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
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE TABLE `products` (
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
	`featured` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_shop_idx` ON `products` (`shop_slug`);--> statement-breakpoint
CREATE TABLE `redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`reward_name` text NOT NULL,
	`points_spent` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer,
	`fulfilled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `redemptions_user_idx` ON `redemptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `reservations` (
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
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_reference_unique` ON `reservations` (`reference`);--> statement-breakpoint
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);--> statement-breakpoint
CREATE INDEX `reservations_date_idx` ON `reservations` (`date`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`points` integer NOT NULL,
	`image` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_slug_unique` ON `rewards` (`slug`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `shops` (
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
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_slug_unique` ON `shops` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`email_verified_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);