ALTER TABLE `orders` ADD `reservation_id` text REFERENCES reservations(id);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_reservation_idx` ON `orders` (`reservation_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `shop_slug` text REFERENCES shops(slug);--> statement-breakpoint
CREATE INDEX `users_shop_idx` ON `users` (`shop_slug`);