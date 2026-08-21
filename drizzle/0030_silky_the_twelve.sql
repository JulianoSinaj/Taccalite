CREATE TABLE `delivery_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mode` text DEFAULT 'delivery' NOT NULL,
	`postcodes` text DEFAULT '[]' NOT NULL,
	`shop_slug` text,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`free_over_cents` integer,
	`min_order_cents` integer DEFAULT 0 NOT NULL,
	`per_kg_cents` integer,
	`lead_time_hours` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "delivery_zones_mode_ck" CHECK("delivery_zones"."mode" in ('delivery', 'shipping')),
	CONSTRAINT "delivery_zones_amounts_ck" CHECK("delivery_zones"."fee_cents" >= 0 and "delivery_zones"."min_order_cents" >= 0 and "delivery_zones"."lead_time_hours" >= 0
        and ("delivery_zones"."free_over_cents" is null or "delivery_zones"."free_over_cents" >= 0)
        and ("delivery_zones"."per_kg_cents" is null or "delivery_zones"."per_kg_cents" >= 0))
);
--> statement-breakpoint
CREATE INDEX `delivery_zones_mode_idx` ON `delivery_zones` (`mode`,`active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `pickup_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_slug` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`capacity_orders` integer,
	`cutoff_hours` integer DEFAULT 2 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`shop_slug`) REFERENCES `shops`(`slug`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "pickup_slots_weekday_ck" CHECK("pickup_slots"."weekday" between 1 and 7),
	CONSTRAINT "pickup_slots_time_ck" CHECK("pickup_slots"."end_time" > "pickup_slots"."start_time"),
	CONSTRAINT "pickup_slots_capacity_ck" CHECK("pickup_slots"."capacity_orders" is null or "pickup_slots"."capacity_orders" > 0),
	CONSTRAINT "pickup_slots_cutoff_ck" CHECK("pickup_slots"."cutoff_hours" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pickup_slots_unique_idx` ON `pickup_slots` (`shop_slug`,`weekday`,`start_time`);--> statement-breakpoint
CREATE INDEX `pickup_slots_shop_idx` ON `pickup_slots` (`shop_slug`,`weekday`);--> statement-breakpoint
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
	`pickup_slot_at` integer,
	`delivery_zone_id` text,
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
	`refunded_at` integer,
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
	FOREIGN KEY (`delivery_zone_id`) REFERENCES `delivery_zones`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_status_ck" CHECK("__new_orders"."status" in ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')),
	CONSTRAINT "orders_fulfilment_ck" CHECK("__new_orders"."fulfilment" in ('pickup', 'delivery', 'shipping')),
	CONSTRAINT "orders_payment_status_ck" CHECK("__new_orders"."payment_status" in ('unpaid', 'paid', 'refunded')),
	CONSTRAINT "orders_amounts_ck" CHECK("__new_orders"."subtotal_cents" >= 0 and "__new_orders"."shipping_cents" >= 0 and "__new_orders"."total_cents" >= 0),
	CONSTRAINT "orders_refunded_ck" CHECK("__new_orders"."refunded_cents" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "order_number", "user_id", "email", "name", "phone", "status", "fulfilment", "shop_slug", "shipping_address", "subtotal_cents", "shipping_cents", "discount_code", "discount_cents", "total_cents", "currency", "payment_provider", "payment_status", "refunded_cents", "paid_at", "refunded_at", "customer_tax_code", "customer_vat_number", "customer_sdi_code", "customer_pec", "stripe_session_id", "stripe_payment_intent_id", "carrier", "tracking_number", "notes", "internal_notes", "created_at", "updated_at") SELECT "id", "order_number", "user_id", "email", "name", "phone", "status", "fulfilment", "shop_slug", "shipping_address", "subtotal_cents", "shipping_cents", "discount_code", "discount_cents", "total_cents", "currency", "payment_provider", "payment_status", "refunded_cents", "paid_at", "refunded_at", "customer_tax_code", "customer_vat_number", "customer_sdi_code", "customer_pec", "stripe_session_id", "stripe_payment_intent_id", "carrier", "tracking_number", "notes", "internal_notes", "created_at", "updated_at" FROM `orders`;--> statement-breakpoint
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
CREATE INDEX `orders_refunded_at_idx` ON `orders` (`refunded_at`);--> statement-breakpoint
CREATE INDEX `orders_stripe_session_idx` ON `orders` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `orders_stripe_pi_idx` ON `orders` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `orders_pickup_slot_idx` ON `orders` (`pickup_slot_at`);--> statement-breakpoint
CREATE INDEX `orders_zone_idx` ON `orders` (`delivery_zone_id`);
--> statement-breakpoint
/*
 * ── Hand-written from here down ──────────────────────────────────────────────
 *
 * Three hand-edits, because drizzle-kit's table rebuild does not survive contact
 * with this table on its own.
 *
 * 1. The generated `INSERT INTO __new_orders ... SELECT ... FROM orders` above
 *    listed `pickup_slot_at` and `delivery_zone_id` on **both** sides — but they
 *    are the columns this migration is adding, so selecting them from the old
 *    table is "no such column" and the migration cannot run at all. Removed from
 *    both lists; they arrive NULL, which is what they should be for every order
 *    placed before slots and zones existed.
 *
 * 2. `orders_fts` (migration 0024) is an FTS5 **external-content** index over
 *    `orders`, kept in sync by three AFTER triggers and linked by **rowid**.
 *    `DROP TABLE orders` takes those triggers with it, silently — DROP TABLE
 *    fires no triggers, so the index is not even notified that its content is
 *    gone. Worse, `__new_orders` is a rowid table, so the copy renumbers every
 *    row: the surviving index entries would point at whichever order happens to
 *    land on that rowid now. Admin order search would keep answering, with the
 *    wrong rows, and nothing would report an error.
 *
 *    So: recreate the triggers verbatim from 0024, then rebuild the index from
 *    the new content table.
 *
 * 3. A "Resto d'Italia" zone seeded from the flat settings, so pricing does not
 *    regress the moment `calculateOrder` starts reading zones.
 */
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
--> statement-breakpoint
/* Re-derive every index entry from the renumbered content table. */
INSERT INTO orders_fts(orders_fts) VALUES('rebuild');
--> statement-breakpoint
/*
 * The catch-all courier zone, carrying the exact numbers the flat settings hold
 * today so no existing shipping price moves. `postcodes = '[]'` is the
 * catch-all, and `sort_order = 100` keeps it last so any zone added later wins.
 *
 * `store.shippingCents` / `store.freeShippingThresholdCents` stay in Settings as
 * the value this row was seeded from; the zone is the authority from now on.
 * A threshold of 0 means "no free shipping", which is `null` here, not 0 — 0
 * would read as "always free".
 */
INSERT INTO delivery_zones (id, name, mode, postcodes, fee_cents, free_over_cents, min_order_cents, lead_time_hours, note, sort_order, active)
SELECT
	lower(hex(randomblob(12))),
	'Resto d''Italia',
	'shipping',
	'[]',
	coalesce((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'store.shippingCents'), 700),
	nullif(coalesce((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'store.freeShippingThresholdCents'), 0), 0),
	0,
	0,
	'Spedizione con corriere in tutta Italia.',
	100,
	1
WHERE NOT EXISTS (SELECT 1 FROM delivery_zones);
