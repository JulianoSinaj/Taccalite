ALTER TABLE `orders` ADD `paid_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_tax_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_vat_number` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_sdi_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_pec` text;--> statement-breakpoint
CREATE INDEX `orders_paid_at_idx` ON `orders` (`payment_status`,`paid_at`);