ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'card' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_with` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `stock_applied_at` integer;--> statement-breakpoint
-- Backfill: orders rung up at the counter were never "card", and saying so would
-- put MP08 on a cash sale's invoice. `payment_provider` is the only evidence the
-- old model kept, so use it.
UPDATE `orders` SET `payment_method` = 'counter' WHERE `payment_provider` = 'manual';--> statement-breakpoint
UPDATE `orders` SET `paid_with` = 'card' WHERE `payment_status` IN ('paid','refunded') AND `payment_provider` = 'stripe';--> statement-breakpoint
-- A counter sale settled before this column existed is overwhelmingly contanti,
-- and that is also what the invoice defaulted to reporting for it.
UPDATE `orders` SET `paid_with` = 'cash' WHERE `payment_status` IN ('paid','refunded') AND `payment_provider` = 'manual';--> statement-breakpoint
-- Every already-paid order HAS had its stock decremented (the old finalizeOrder
-- did it unconditionally). Without this backfill a refund of one of them would
-- see a null stamp, conclude nothing was ever taken out, and refuse to give the
-- goods back.
UPDATE `orders` SET `stock_applied_at` = COALESCE(`paid_at`, `created_at`) WHERE `payment_status` IN ('paid','refunded');
