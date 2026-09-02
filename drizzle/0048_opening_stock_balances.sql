-- Opening balances, so the ledger sums to the shelf for every product.
--
-- `applyStockChange` has always written a movement for each change, but a
-- product created before that path existed — or seeded with an opening figure —
-- simply *had* stock, with no movement behind it. So sum(delta) matched
-- products.stock for new rows and silently did not for old ones, and there was
-- no way to tell a legacy product apart from one whose ledger had genuinely
-- drifted. That ambiguity is the reason nothing could reconcile the two.
--
-- One synthetic movement per stock-tracking product that has no history at all,
-- carrying its current on-hand. After this the invariant holds for every row,
-- and any later divergence is a real one worth showing somebody.
--
-- `lower(hex(randomblob(16)))` because ids are generated in JS (`nanoid()`) and
-- SQL cannot call it; the shape differs from a nanoid but nothing parses these.
-- Written only where NOT EXISTS, so re-running changes nothing.
INSERT INTO stock_movements (id, product_id, delta, reason, stock_after, created_at)
SELECT
  lower(hex(randomblob(16))),
  p.id,
  p.stock,
  'Giacenza iniziale (riconciliazione)',
  p.stock,
  unixepoch() * 1000
FROM products p
WHERE p.stock IS NOT NULL
  AND p.stock > 0
  AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id);
