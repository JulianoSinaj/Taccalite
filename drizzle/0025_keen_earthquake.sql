PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
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
	`discount_code` text,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'eur' NOT NULL,
	`payment_provider` text DEFAULT 'stripe',
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`paid_at` integer,
	`customer_tax_code` text,
	`customer_vat_number` text,
	`customer_sdi_code` text,
	`customer_pec` text,
	`stripe_session_id` text,
	`stripe_payment_intent_id` text,
	`carrier` text,
	`tracking_number` text,
	`notes` text,
	`internal_notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "orders_status_ck" CHECK("__new_orders"."status" in ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')),
	CONSTRAINT "orders_fulfilment_ck" CHECK("__new_orders"."fulfilment" in ('pickup', 'shipping')),
	CONSTRAINT "orders_payment_status_ck" CHECK("__new_orders"."payment_status" in ('unpaid', 'paid', 'refunded')),
	CONSTRAINT "orders_amounts_ck" CHECK("__new_orders"."subtotal_cents" >= 0 and "__new_orders"."shipping_cents" >= 0 and "__new_orders"."total_cents" >= 0),
	CONSTRAINT "orders_refunded_ck" CHECK("__new_orders"."refunded_cents" >= 0)
);
--> statement-breakpoint
--> HAND-EDITED: drizzle-kit emitted `"refunded_cents"` and `"stripe_payment_intent_id"`
--> in the SELECT list, but those columns only exist on `__new_orders` — reading them
--> from the old `orders` table fails with "no such column" at boot. Both are new, so
--> the rebuild seeds them with their defaults instead (0 / NULL).
INSERT INTO `__new_orders`("id", "order_number", "user_id", "email", "name", "phone", "status", "fulfilment", "shop_slug", "shipping_address", "subtotal_cents", "shipping_cents", "discount_code", "discount_cents", "total_cents", "currency", "payment_provider", "payment_status", "refunded_cents", "paid_at", "customer_tax_code", "customer_vat_number", "customer_sdi_code", "customer_pec", "stripe_session_id", "stripe_payment_intent_id", "carrier", "tracking_number", "notes", "internal_notes", "created_at", "updated_at") SELECT "id", "order_number", "user_id", "email", "name", "phone", "status", "fulfilment", "shop_slug", "shipping_address", "subtotal_cents", "shipping_cents", "discount_code", "discount_cents", "total_cents", "currency", "payment_provider", "payment_status", 0, "paid_at", "customer_tax_code", "customer_vat_number", "customer_sdi_code", "customer_pec", "stripe_session_id", NULL, "carrier", "tracking_number", "notes", "internal_notes", "created_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_shop_idx` ON `orders` (`shop_slug`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_paid_created_idx` ON `orders` (`payment_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_paid_at_idx` ON `orders` (`payment_status`,`paid_at`);--> statement-breakpoint
CREATE INDEX `orders_stripe_session_idx` ON `orders` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `orders_stripe_pi_idx` ON `orders` (`stripe_payment_intent_id`);--> statement-breakpoint

-- HAND-ADDED: the rebuild above did `DROP TABLE orders`, and SQLite drops a
-- table's triggers with it — so the `orders_fts` sync triggers from 0024 are
-- gone and its external content now points at a table whose rowids were
-- reassigned. Order search silently returns nothing until both are restored.
-- Rebuild the index and its triggers verbatim from 0024.
DROP TRIGGER IF EXISTS orders_fts_ai;--> statement-breakpoint
DROP TRIGGER IF EXISTS orders_fts_ad;--> statement-breakpoint
DROP TRIGGER IF EXISTS orders_fts_au;--> statement-breakpoint
DROP TABLE IF EXISTS orders_fts;--> statement-breakpoint
CREATE VIRTUAL TABLE orders_fts USING fts5(
	order_number, name, email,
	content='orders', content_rowid='rowid', tokenize='trigram'
);
--> statement-breakpoint
INSERT INTO orders_fts(rowid, order_number, name, email)
	SELECT rowid, coalesce(order_number,''), coalesce(name,''), coalesce(email,'') FROM orders;
--> statement-breakpoint
CREATE TRIGGER orders_fts_ai AFTER INSERT ON orders BEGIN
	INSERT INTO orders_fts(rowid, order_number, name, email)
	VALUES (new.rowid, coalesce(new.order_number,''), coalesce(new.name,''), coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER orders_fts_ad AFTER DELETE ON orders BEGIN
	INSERT INTO orders_fts(orders_fts, rowid, order_number, name, email)
	VALUES ('delete', old.rowid, coalesce(old.order_number,''), coalesce(old.name,''), coalesce(old.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER orders_fts_au AFTER UPDATE ON orders BEGIN
	INSERT INTO orders_fts(orders_fts, rowid, order_number, name, email)
	VALUES ('delete', old.rowid, coalesce(old.order_number,''), coalesce(old.name,''), coalesce(old.email,''));
	INSERT INTO orders_fts(rowid, order_number, name, email)
	VALUES (new.rowid, coalesce(new.order_number,''), coalesce(new.name,''), coalesce(new.email,''));
END;