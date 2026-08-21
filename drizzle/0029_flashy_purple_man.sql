CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'product' NOT NULL,
	`parent_id` text,
	`default_vat_rate_bps` integer,
	`accent` text,
	`description` text DEFAULT '' NOT NULL,
	`image` text,
	`seo_title` text,
	`seo_description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "categories_kind_ck" CHECK("categories"."kind" in ('product', 'post')),
	CONSTRAINT "categories_vat_ck" CHECK("categories"."default_vat_rate_bps" is null or ("categories"."default_vat_rate_bps" >= 0 and "categories"."default_vat_rate_bps" <= 10000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_kind_slug_idx` ON `categories` (`kind`,`slug`);--> statement-breakpoint
CREATE INDEX `categories_kind_sort_idx` ON `categories` (`kind`,`sort_order`);--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `category_id` text REFERENCES categories(id);--> statement-breakpoint
ALTER TABLE `products` ADD `category_id` text REFERENCES categories(id);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`);--> statement-breakpoint
-- ── Backfill: turn the existing free-text categories into real rows ──────────
-- Written by hand on top of the generated schema change. It runs everywhere
-- migrations run (docker entrypoint, vercel-build, dev, the vitest DB), so no
-- environment is left with products pointing at a taxonomy that doesn't exist.
--
-- Slugs are built in SQL because SQLite has no regex: lowercase, strip the
-- accents an Italian category name can carry, punctuation to hyphens, collapse,
-- trim. Same rules as `slugify()` in lib/slug.ts, minus the general
-- non-alphanumeric class, which is not expressible here.
INSERT INTO `categories` (`id`, `slug`, `name`, `kind`, `sort_order`, `active`, `created_at`, `default_vat_rate_bps`)
WITH src AS (
  SELECT 'product' AS kind, `category` AS name, count(*) AS n
  FROM `products` WHERE trim(`category`) <> '' GROUP BY `category`
  UNION ALL
  SELECT 'post' AS kind, `category` AS name, count(*) AS n
  FROM `blog_posts` WHERE trim(`category`) <> '' GROUP BY `category`
),
unaccented AS (
  SELECT kind, name, n,
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      lower(name),
      'à','a'),'á','a'),'â','a'),'ä','a'),
      'è','e'),'é','e'),'ê','e'),'ë','e'),
      'ì','i'),'í','i'),'î','i'),'ï','i'),
      'ò','o'),'ó','o'),'ô','o'),'ö','o'),
      'ù','u'),'ú','u'),'û','u'),'ü','u') AS s
  FROM src
),
punctuated AS (
  SELECT kind, name, n,
    replace(replace(replace(replace(replace(replace(replace(replace(replace(
      s, ' ','-'), '''','-'), '/','-'), '\','-'), '&','-'), ',','-'), '.','-'),
      '(','-'), ')','-') AS s
  FROM unaccented
),
collapsed AS (
  SELECT kind, name, n, replace(replace(replace(s,'----','-'),'---','-'),'--','-') AS s
  FROM punctuated
),
based AS (
  SELECT kind, name, n, trim(s,'-') AS base FROM collapsed
),
numbered AS (
  SELECT kind, name, n, base,
    -- Two different names can slugify to the same string; the second one takes
    -- a numeric suffix rather than failing the unique index (and the migration).
    row_number() OVER (PARTITION BY kind, base ORDER BY n DESC, name) AS dup,
    -- Seed order = how much the shop actually uses each one. The storefront rail
    -- was effectively in this order already; now it is editable.
    row_number() OVER (PARTITION BY kind ORDER BY n DESC, name) AS ord
  FROM based
)
SELECT
  lower(hex(randomblob(12))),
  CASE WHEN base = '' THEN 'categoria-' || ord
       WHEN dup = 1 THEN base
       ELSE base || '-' || dup END,
  name,
  kind,
  ord,
  1,
  unixepoch() * 1000,
  -- The rate that category's products mostly use — the same rule the old
  -- `getCategoryVatDefaults()` inferred on every render, now recorded once so a
  -- mixed category can be corrected permanently instead of re-guessed.
  CASE WHEN kind = 'product' THEN (
    SELECT p.`vat_rate_bps` FROM `products` p
    WHERE p.`category` = numbered.name
    GROUP BY p.`vat_rate_bps` ORDER BY count(*) DESC LIMIT 1
  ) END
FROM numbered
WHERE true
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE `products` SET `category_id` = (
  SELECT c.`id` FROM `categories` c WHERE c.`kind` = 'product' AND c.`name` = `products`.`category`
) WHERE trim(`category`) <> '';--> statement-breakpoint
UPDATE `blog_posts` SET `category_id` = (
  SELECT c.`id` FROM `categories` c WHERE c.`kind` = 'post' AND c.`name` = `blog_posts`.`category`
) WHERE trim(`category`) <> '';
