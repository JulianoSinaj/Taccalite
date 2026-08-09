PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`reminded_at` integer,
	`waitlisted` integer DEFAULT false NOT NULL,
	`ready_at` integer,
	`deposit_cents` integer DEFAULT 0 NOT NULL,
	`deposit_paid_at` integer,
	`deposit_forfeited_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reservations_type_ck" CHECK("__new_reservations"."type" in ('table', 'porchetta', 'order')),
	CONSTRAINT "reservations_status_ck" CHECK("__new_reservations"."status" in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'))
);
--> statement-breakpoint
--> HAND-EDITED: `deposit_forfeited_at` is new on `__new_reservations` only, so
--> selecting it from the old `reservations` fails with "no such column". Seed it
--> with its default (NULL) instead — no existing booking has forfeited a deposit.
INSERT INTO `__new_reservations`("id", "reference", "type", "name", "phone", "email", "date", "time", "guests", "quantity_kg", "shop_slug", "notes", "status", "admin_notes", "user_id", "reminded_at", "waitlisted", "ready_at", "deposit_cents", "deposit_paid_at", "deposit_forfeited_at", "created_at", "updated_at") SELECT "id", "reference", "type", "name", "phone", "email", "date", "time", "guests", "quantity_kg", "shop_slug", "notes", "status", "admin_notes", "user_id", "reminded_at", "waitlisted", "ready_at", "deposit_cents", "deposit_paid_at", NULL, "created_at", "updated_at" FROM `reservations`;--> statement-breakpoint
DROP TABLE `reservations`;--> statement-breakpoint
ALTER TABLE `__new_reservations` RENAME TO `reservations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_reference_unique` ON `reservations` (`reference`);--> statement-breakpoint
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);--> statement-breakpoint
CREATE INDEX `reservations_date_idx` ON `reservations` (`date`);--> statement-breakpoint
CREATE INDEX `reservations_user_idx` ON `reservations` (`user_id`);--> statement-breakpoint
CREATE INDEX `reservations_shop_idx` ON `reservations` (`shop_slug`);--> statement-breakpoint
CREATE INDEX `reservations_cron_idx` ON `reservations` (`type`,`status`,`date`);--> statement-breakpoint
CREATE INDEX `reservations_created_idx` ON `reservations` (`created_at`);--> statement-breakpoint

-- HAND-ADDED: `DROP TABLE reservations` above took the `reservations_fts` sync
-- triggers with it and orphaned the index's external content, which silently
-- breaks reservation search. Rebuild both, verbatim from 0024.
DROP TRIGGER IF EXISTS reservations_fts_ai;--> statement-breakpoint
DROP TRIGGER IF EXISTS reservations_fts_ad;--> statement-breakpoint
DROP TRIGGER IF EXISTS reservations_fts_au;--> statement-breakpoint
DROP TABLE IF EXISTS reservations_fts;--> statement-breakpoint
CREATE VIRTUAL TABLE reservations_fts USING fts5(
	reference, name, phone, email,
	content='reservations', content_rowid='rowid', tokenize='trigram'
);
--> statement-breakpoint
INSERT INTO reservations_fts(rowid, reference, name, phone, email)
	SELECT rowid, coalesce(reference,''), coalesce(name,''), coalesce(phone,''), coalesce(email,'') FROM reservations;
--> statement-breakpoint
CREATE TRIGGER reservations_fts_ai AFTER INSERT ON reservations BEGIN
	INSERT INTO reservations_fts(rowid, reference, name, phone, email)
	VALUES (new.rowid, coalesce(new.reference,''), coalesce(new.name,''), coalesce(new.phone,''), coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER reservations_fts_ad AFTER DELETE ON reservations BEGIN
	INSERT INTO reservations_fts(reservations_fts, rowid, reference, name, phone, email)
	VALUES ('delete', old.rowid, coalesce(old.reference,''), coalesce(old.name,''), coalesce(old.phone,''), coalesce(old.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER reservations_fts_au AFTER UPDATE ON reservations BEGIN
	INSERT INTO reservations_fts(reservations_fts, rowid, reference, name, phone, email)
	VALUES ('delete', old.rowid, coalesce(old.reference,''), coalesce(old.name,''), coalesce(old.phone,''), coalesce(old.email,''));
	INSERT INTO reservations_fts(rowid, reference, name, phone, email)
	VALUES (new.rowid, coalesce(new.reference,''), coalesce(new.name,''), coalesce(new.phone,''), coalesce(new.email,''));
END;