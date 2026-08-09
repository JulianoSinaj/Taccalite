CREATE INDEX `email_outbox_created_idx` ON `email_outbox` (`created_at`);--> statement-breakpoint
CREATE INDEX `order_items_product_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_paid_created_idx` ON `orders` (`payment_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_stripe_session_idx` ON `orders` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `redemptions_created_idx` ON `redemptions` (`created_at`);--> statement-breakpoint
CREATE INDEX `reservations_created_idx` ON `reservations` (`created_at`);--> statement-breakpoint
CREATE INDEX `users_created_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);