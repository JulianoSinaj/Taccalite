DROP INDEX `orders_paid_at_idx`;--> statement-breakpoint
DROP INDEX `orders_refunded_at_idx`;--> statement-breakpoint
-- Hand-written (drizzle-kit cannot serialize an expression index — it splits the
-- expression on its comma and emits invalid SQL), so these are invisible to the
-- schema snapshot, exactly like the FTS tables in 0024. See the note on the
-- `orders` table in lib/db/schema.ts.
--
-- The IVA report selects by fiscal date, not by `paid_at`: an order settled
-- before `paid_at` existed still has to land in a period, so both passes filter
-- on a `coalesce(...)` expression. SQLite will not use an index for a column
-- wrapped in a function, so the plain `paid_at` / `refunded_at` indexes dropped
-- above could never serve those predicates and every report scanned all of
-- `orders`. These index the expressions themselves.
--
-- The expression must stay byte-for-byte equivalent to the one in the query
-- (`fiscalDate` / `reversalDate` in lib/admin/queries.ts) or the planner
-- silently falls back to a scan.
CREATE INDEX `orders_fiscal_date_idx` ON `orders` (`payment_status`, coalesce(`paid_at`, `created_at`));--> statement-breakpoint
CREATE INDEX `orders_reversal_date_idx` ON `orders` (coalesce(`refunded_at`, `updated_at`));
