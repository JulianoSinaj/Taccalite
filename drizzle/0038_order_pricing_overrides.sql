ALTER TABLE `orders` ADD `manual_discount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_override_cents` integer;