CREATE TABLE `discount_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'percent' NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`min_subtotal_cents` integer DEFAULT 0 NOT NULL,
	`max_redemptions` integer,
	`times_used` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	CONSTRAINT "discount_type_ck" CHECK("discount_codes"."type" in ('percent', 'fixed', 'free_shipping')),
	CONSTRAINT "discount_value_ck" CHECK("discount_codes"."value" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discount_codes_code_unique` ON `discount_codes` (`code`);--> statement-breakpoint
CREATE INDEX `discount_active_idx` ON `discount_codes` (`active`);--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_cents` integer DEFAULT 0 NOT NULL;