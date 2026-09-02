ALTER TABLE `stock_movements` ADD `order_id` text;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `lots` text;--> statement-breakpoint
CREATE INDEX `stock_mov_order_idx` ON `stock_movements` (`order_id`);