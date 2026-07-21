ALTER TABLE `reservations` ADD `deposit_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `deposit_paid_at` integer;