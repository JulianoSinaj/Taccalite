/**
 * Populate the gestionale with a realistic body of demo data.
 *
 * `db:seed` gives you a *working* shop (two locations, four products, an admin).
 * That is deliberately minimal — but it means every admin list is empty or
 * near-empty, so the dashboard KPIs read zero, the charts are flat, the IVA
 * report has nothing to total, pagination never appears and no filter can be
 * exercised. This fills all of that in.
 *
 *   npm run db:seed:demo            # add demo data (safe to re-run)
 *   npm run db:seed:demo -- --reset # remove previous demo data first
 *
 * Everything it writes is tagged so it can be removed again: demo customers use
 * `@demo.taccalite.it` addresses, orders are numbered `ORD-D…`, reservations are
 * referenced `DEMO-…`, and demo products/posts/rewards/codes carry a `demo-`
 * slug or `DEMO` code prefix. Real data is never touched. Run it against a dev
 * database — it is not meant for production.
 *
 * Volumes are generated from a fixed PRNG seed, so two runs of the same version
 * produce the same shop: a bug you see is a bug you can reproduce.
 */
import "./_bootstrap-env"; // MUST be first: defaults NODE_ENV before lib/env loads
import { openDatabase, type Db } from "../lib/db/connection";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
import { env } from "../lib/env";

const RESET = process.argv.includes("--reset");
const DEMO_DOMAIN = "demo.taccalite.it";

// Opened (and migrated) at the top of main() — local file or remote Turso, see
// lib/db/connection.ts. Module-level so the generator helpers below can use it.
let db!: Db;

// ── Deterministic randomness ─────────────────────────────────────────────────
/** mulberry32 — small, fast, and seeded, so every run generates the same shop. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260810);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(xs: readonly T[]): T => xs[int(0, xs.length - 1)];
/** Weighted pick: `[[value, weight], …]`. Keeps status mixes realistic. */
function weighted<T>(pairs: readonly (readonly [T, number])[]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
}
const chance = (p: number) => rand() < p;

const NOW = new Date();
const DAY = 86_400_000;
/** A date `daysAgo` back, at a plausible shop hour rather than midnight. */
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY - int(0, 11) * 3_600_000 - int(0, 59) * 60_000);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ── Italian name pool ────────────────────────────────────────────────────────
const FIRST = [
  "Marco", "Giulia", "Alessandro", "Francesca", "Lorenzo", "Chiara", "Matteo", "Sara",
  "Andrea", "Elena", "Davide", "Martina", "Simone", "Alessia", "Luca", "Valentina",
  "Riccardo", "Federica", "Stefano", "Beatrice", "Giovanni", "Silvia", "Paolo", "Anna",
  "Fabio", "Ilaria", "Nicola", "Camilla", "Roberto", "Giorgia",
];
const LAST = [
  "Rossi", "Ferrari", "Russo", "Bianchi", "Romano", "Gallo", "Costa", "Fontana",
  "Conti", "Esposito", "Ricci", "Bruno", "Greco", "Marino", "Rizzo", "Moretti",
  "Barbieri", "Lombardi", "Giordano", "Colombo", "Mancini", "Longo", "Leone", "Martini",
];
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ── Catalogue ────────────────────────────────────────────────────────────────
type DemoProduct = {
  name: string; category: string; priceCents: number; unit: string; vatRateBps: number;
  soldByWeight?: boolean; stock: number | null; cost?: number; allergens?: string[]; origin?: string;
};
const CATALOGUE: DemoProduct[] = [
  { name: "Salame di Fabriano", category: "Salumi", priceCents: 520, unit: "etto", vatRateBps: 1000, stock: 24, cost: 310 },
  { name: "Coppa di testa", category: "Salumi", priceCents: 380, unit: "etto", vatRateBps: 1000, stock: 12, cost: 210 },
  { name: "Lonza stagionata", category: "Salumi", priceCents: 610, unit: "etto", vatRateBps: 1000, stock: 3, cost: 380 },
  { name: "Guanciale di Norcia", category: "Salumi", priceCents: 450, unit: "etto", vatRateBps: 1000, stock: 0, cost: 260 },
  { name: "Prosciutto di Carpegna DOP", category: "Salumi", priceCents: 690, unit: "etto", vatRateBps: 1000, stock: 18, cost: 430 },
  { name: "Mortadella classica", category: "Salumi", priceCents: 290, unit: "etto", vatRateBps: 1000, stock: 31, cost: 165 },
  { name: "Casciotta d'Urbino DOP", category: "Formaggi", priceCents: 480, unit: "etto", vatRateBps: 1000, stock: 15, cost: 290, allergens: ["latte"] },
  { name: "Caciotta al tartufo", category: "Formaggi", priceCents: 560, unit: "etto", vatRateBps: 1000, stock: 9, cost: 340, allergens: ["latte"] },
  { name: "Ricotta fresca di pecora", category: "Formaggi", priceCents: 320, unit: "etto", vatRateBps: 1000, stock: 4, cost: 180, allergens: ["latte"] },
  { name: "Parmigiano Reggiano 36 mesi", category: "Formaggi", priceCents: 720, unit: "etto", vatRateBps: 1000, stock: 22, cost: 460, allergens: ["latte"] },
  { name: "Arista di maiale", category: "Carni", priceCents: 1150, unit: "kg", vatRateBps: 1000, soldByWeight: true, stock: 8, cost: 720, origin: "Suino nazionale — Marche" },
  { name: "Salsiccia fresca marchigiana", category: "Carni", priceCents: 890, unit: "kg", vatRateBps: 1000, soldByWeight: true, stock: 14, cost: 540, origin: "Suino nazionale — Marche" },
  { name: "Costine di maiale", category: "Carni", priceCents: 790, unit: "kg", vatRateBps: 1000, soldByWeight: true, stock: 2, cost: 470, origin: "Suino nazionale — Marche" },
  { name: "Pollo ruspante intero", category: "Carni", priceCents: 980, unit: "kg", vatRateBps: 1000, soldByWeight: true, stock: 6, cost: 620, origin: "Avicolo — Marche" },
  { name: "Olive all'ascolana (fritte)", category: "Gastronomia", priceCents: 420, unit: "etto", vatRateBps: 1000, stock: 20, cost: 230, allergens: ["glutine", "uova", "latte"] },
  { name: "Vincisgrassi (teglia 4 porzioni)", category: "Gastronomia", priceCents: 1800, unit: "pezzo", vatRateBps: 1000, stock: 5, cost: 1050, allergens: ["glutine", "uova", "latte", "sedano"] },
  { name: "Crescia sfogliata", category: "Gastronomia", priceCents: 250, unit: "pezzo", vatRateBps: 400, stock: 30, cost: 120, allergens: ["glutine", "uova"] },
  { name: "Verdicchio dei Castelli di Jesi DOC", category: "Cantina", priceCents: 1400, unit: "bottiglia", vatRateBps: 2200, stock: 36, cost: 780, allergens: ["solfiti"] },
  { name: "Rosso Conero DOC", category: "Cantina", priceCents: 1650, unit: "bottiglia", vatRateBps: 2200, stock: 24, cost: 920, allergens: ["solfiti"] },
  { name: "Cesto regalo «Marche»", category: "Regalo", priceCents: 4500, unit: "pezzo", vatRateBps: 2200, stock: null, cost: 2600 },
];

// ── Reset ────────────────────────────────────────────────────────────────────
async function resetDemo() {
  const client = db.$client;
  const demoUsers = await client.execute(`select id from users where email like '%@${DEMO_DOMAIN}'`);
  const ids = demoUsers.rows.map((u) => String(u.id));
  // One write-mode batch = one transaction: all-or-nothing, like the old sync tx.
  await client.batch(
    [
      "delete from order_items where order_id in (select id from orders where order_number like 'ORD-D%')",
      "delete from orders where order_number like 'ORD-D%'",
      "delete from reservations where reference like 'DEMO-%'",
      "delete from newsletter_subscribers where email like '%@" + DEMO_DOMAIN + "'",
      "delete from stock_movements where product_id in (select id from products where slug like 'demo-%')",
      "delete from products where slug like 'demo-%'",
      "delete from blog_posts where slug like 'demo-%'",
      "delete from rewards where slug like 'demo-%'",
      "delete from discount_codes where code like 'DEMO%'",
      "delete from audit_log where actor_name like '%(demo)%'",
      "delete from email_outbox where to_address like '%@" + DEMO_DOMAIN + "'",
      "delete from page_views where path like '/negozio%' or path like '/porchetta%'",
      ...ids.flatMap((id) => [
        { sql: "delete from redemptions where user_id = ?", args: [id] },
        { sql: "delete from loyalty_transactions where user_id = ?", args: [id] },
        { sql: "delete from loyalty_accounts where user_id = ?", args: [id] },
        { sql: "delete from users where id = ?", args: [id] },
      ]),
    ],
    "write",
  );
  console.log(`  cleared previous demo data (${ids.length} demo customers)`);
}

async function main() {
  db = await openDatabase(env.databaseUrl, env.databaseAuthToken, { migrate: true });
  if (RESET) await resetDemo();

  const shops = await db.select().from(schema.shops);
  if (shops.length === 0) throw new Error("No shops found — run `npm run db:seed` first.");
  const shopSlugs = shops.map((s) => s.slug);

  const [admin] = await db.select().from(schema.users).where(eq(schema.users.role, "admin")).limit(1);
  const actorId = admin?.id ?? null;
  const actorName = `${admin?.name || "Titolare"} (demo)`;

  // ── Products ───────────────────────────────────────────────────────────────
  for (const [i, p] of CATALOGUE.entries()) {
    await db
      .insert(schema.products)
      .values({
        slug: `demo-${slugify(p.name)}`,
        name: p.name,
        shopSlug: p.category === "Carni" ? (shopSlugs.includes("carni") ? "carni" : shopSlugs[0]) : shopSlugs[0],
        category: p.category,
        description: `${p.name} — selezione della norcineria, disponibile al banco.`,
        priceCents: p.priceCents,
        unit: p.unit,
        vatRateBps: p.vatRateBps,
        soldByWeight: !!p.soldByWeight,
        allergens: p.allergens ?? [],
        origin: p.origin ?? null,
        purchasable: true,
        stock: p.stock,
        reorderPoint: p.stock === null ? null : 5,
        costCents: p.cost ?? null,
        sku: `TAC-${String(100 + i)}`,
        supplier: pick(["Consorzio Marche", "Az. Agricola Verdi", "Caseificio Esino", "Cantina Conero"]),
        featured: i < 4,
        active: i !== CATALOGUE.length - 2, // leave one deactivated, so that filter has a hit
        sortOrder: 100 + i,
        createdAt: daysAgo(int(200, 420)),
      })
      .onConflictDoNothing({ target: schema.products.slug });
  }
  const products = await db.select().from(schema.products);
  const sellable = products.filter((p) => p.purchasable && p.priceCents);
  console.log(`✓ products: ${products.length} total`);

  // ── Customers + loyalty ────────────────────────────────────────────────────
  const CUSTOMERS = 120;
  const sharedHash = hashPassword("demo-password-not-for-production");
  const customers: { id: string; name: string; email: string; phone: string }[] = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < CUSTOMERS; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    let email = `${slugify(name)}@${DEMO_DOMAIN}`;
    if (usedEmails.has(email)) email = `${slugify(name)}${i}@${DEMO_DOMAIN}`;
    usedEmails.add(email);
    const phone = `3${int(20, 89)}${String(int(1000000, 9999999))}`;
    const createdAt = daysAgo(int(1, 430));
    const [row] = await db
      .insert(schema.users)
      .values({
        username: email,
        email,
        name,
        passwordHash: sharedHash,
        phone,
        role: "customer",
        marketingConsent: chance(0.6),
        emailVerifiedAt: chance(0.8) ? createdAt : null,
        createdAt,
      })
      .onConflictDoNothing({ target: schema.users.username })
      .returning({ id: schema.users.id });
    if (!row) continue;
    customers.push({ id: row.id, name, email, phone });

    // Roughly three in four customers hold a loyalty card.
    if (chance(0.75)) {
      const points = int(0, 1400);
      await db.insert(schema.loyaltyAccounts).values({
        userId: row.id,
        points,
        cardNumber: `TAC-2026-${String(1000 + i)}`,
        createdAt,
      });
      // A short, self-consistent ledger ending on the stored balance.
      let balance = 0;
      const entries = int(2, 6);
      const step = Math.ceil(points / entries) || 1;
      for (let e = 0; e < entries; e++) {
        const delta = e === entries - 1 ? points - balance : Math.min(step, points - balance);
        if (delta <= 0) continue;
        balance += delta;
        await db.insert(schema.loyaltyTransactions).values({
          userId: row.id,
          delta,
          balanceAfter: balance,
          reason: pick(["Acquisto in bottega", "Ordine online", "Bonus benvenuto", "Spesa al banco"]),
          createdAt: daysAgo(int(1, 300)),
        });
      }
    }
  }
  console.log(`✓ customers: ${customers.length} (with loyalty cards + ledgers)`);

  // ── Two staff accounts ─────────────────────────────────────────────────────
  for (const [uname, nm] of [["banco", "Elisa Banconiera"], ["cucina", "Marco Cucina"]] as const) {
    await db
      .insert(schema.users)
      .values({
        username: `${uname}@${DEMO_DOMAIN}`,
        email: `${uname}@${DEMO_DOMAIN}`,
        name: nm,
        passwordHash: sharedHash,
        role: "staff",
        createdAt: daysAgo(int(120, 300)),
      })
      .onConflictDoNothing({ target: schema.users.username });
  }

  // ── Discount codes ─────────────────────────────────────────────────────────
  const CODES = [
    { code: "DEMOBENVENUTO10", type: "percent" as const, value: 10, min: 2000, max: null, used: 34 },
    { code: "DEMOSPEDIZIONE", type: "free_shipping" as const, value: 0, min: 3500, max: null, used: 58 },
    { code: "DEMONATALE20", type: "percent" as const, value: 20, min: 5000, max: 100, used: 100 }, // esaurito
    { code: "DEMO5EURO", type: "fixed" as const, value: 500, min: 2500, max: 200, used: 77 },
    { code: "DEMOPORCHETTA15", type: "percent" as const, value: 15, min: 3000, max: 50, used: 12 },
    { code: "DEMOSCADUTO", type: "percent" as const, value: 25, min: 0, max: null, used: 9 },
  ];
  for (const c of CODES) {
    await db
      .insert(schema.discountCodes)
      .values({
        code: c.code,
        type: c.type,
        value: c.value,
        minSubtotalCents: c.min,
        maxRedemptions: c.max,
        timesUsed: c.used,
        startsAt: daysAgo(200),
        endsAt: c.code === "DEMOSCADUTO" ? daysAgo(30) : new Date(NOW.getTime() + 120 * DAY),
        active: c.code !== "DEMOSCADUTO",
        createdAt: daysAgo(210),
      })
      .onConflictDoNothing({ target: schema.discountCodes.code });
  }
  console.log(`✓ discount codes: ${CODES.length}`);

  // ── Orders ─────────────────────────────────────────────────────────────────
  const ORDERS = 600;
  let orderSeq = 0;
  let refundedTotal = 0;
  let partialCount = 0;

  for (let i = 0; i < ORDERS; i++) {
    // Weight recent months more heavily, so the trend chart slopes upward.
    const age = Math.floor(Math.pow(rand(), 1.6) * 420);
    const createdAt = daysAgo(age);
    const customer = chance(0.72) ? pick(customers) : null;
    const fulfilment = weighted([
      ["pickup", 6] as const,
      ["delivery", 1] as const,
      ["shipping", 3] as const,
    ]);
    const shopSlug = pick(shopSlugs);

    // Lines
    const lineCount = int(1, 5);
    const chosen = new Set<string>();
    const lines: { p: (typeof sellable)[number]; qty: number; total: number }[] = [];
    for (let l = 0; l < lineCount; l++) {
      const p = pick(sellable);
      if (chosen.has(p.id)) continue;
      chosen.add(p.id);
      const qty = int(1, 4);
      lines.push({ p, qty, total: (p.priceCents ?? 0) * qty });
    }
    if (lines.length === 0) continue;

    const subtotalCents = lines.reduce((s, l) => s + l.total, 0);
    const shippingCents =
      fulfilment === "shipping" ? (subtotalCents >= 6000 ? 0 : 700) : fulfilment === "delivery" ? 300 : 0;

    // Coupon on roughly a fifth of orders.
    let discountCents = 0;
    let discountCode: string | null = null;
    if (chance(0.2)) {
      const c = pick(CODES.filter((x) => x.min <= subtotalCents));
      if (c) {
        discountCode = c.code;
        discountCents =
          c.type === "percent" ? Math.round((subtotalCents * c.value) / 100)
          : c.type === "fixed" ? Math.min(c.value, subtotalCents)
          : 0;
      }
    }
    const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

    const status = weighted([
      ["fulfilled", 58] as const,
      ["paid", 16] as const,
      ["pending", 9] as const,
      ["cancelled", 8] as const,
      ["refunded", 9] as const,
    ]);
    const isPaid = status === "paid" || status === "fulfilled" || status === "refunded";
    const paymentStatus = status === "refunded" ? "refunded" : isPaid ? "paid" : "unpaid";

    // Refunds: most are full, some partial. A partial refund leaves the order
    // 'paid' — exactly the state the admin now renders as "Incassato netto".
    let refundedCents = 0;
    let finalStatus: typeof status = status;
    let finalPayment: "unpaid" | "paid" | "refunded" = paymentStatus;
    if (status === "refunded") {
      if (chance(0.35)) {
        refundedCents = Math.round(totalCents * (int(20, 60) / 100));
        finalStatus = "fulfilled";
        finalPayment = "paid";
        partialCount++;
      } else {
        refundedCents = totalCents;
        refundedTotal++;
      }
    }

    orderSeq++;
    const paidAt = isPaid ? new Date(createdAt.getTime() + int(1, 90) * 60_000) : null;
    const [order] = await db
      .insert(schema.orders)
      .values({
        orderNumber: `ORD-D${String(10000 + orderSeq)}`,
        userId: customer?.id ?? null,
        email: customer?.email ?? `ospite${orderSeq}@${DEMO_DOMAIN}`,
        name: customer?.name ?? `${pick(FIRST)} ${pick(LAST)}`,
        phone: customer?.phone ?? null,
        status: finalStatus,
        fulfilment,
        // A local delivery belongs to the location that drives it, exactly like a
        // pickup, so the daily fulfilment screen can group it under that shop.
        shopSlug: fulfilment === "shipping" ? null : shopSlug,
        shippingAddress:
          fulfilment === "pickup"
            ? null
            : {
                address: `Via ${pick(LAST)} ${int(1, 90)}`,
                city: pick(["Ancona", "Jesi", "Falconara", "Osimo", "Senigallia"]),
                zip: `600${int(10, 99)}`,
              },
        subtotalCents,
        shippingCents,
        discountCode,
        discountCents,
        totalCents,
        refundedCents,
        paymentStatus: finalPayment,
        paymentProvider: chance(0.15) ? "manual" : "stripe",
        paidAt,
        stripeSessionId: chance(0.15) ? null : `cs_test_demo${orderSeq}`,
        stripePaymentIntentId: isPaid && chance(0.85) ? `pi_test_demo${orderSeq}` : null,
        carrier: fulfilment === "shipping" && status === "fulfilled" ? pick(["BRT", "GLS", "Poste Italiane"]) : null,
        trackingNumber: fulfilment === "shipping" && status === "fulfilled" ? `IT${int(100000000, 999999999)}` : null,
        notes: chance(0.15) ? pick(["Consegna dopo le 17", "Sottovuoto per viaggio", "Regalo — no scontrino", "Chiamare prima"]) : null,
        createdAt,
        updatedAt: paidAt ?? createdAt,
      })
      .returning({ id: schema.orders.id });

    await db.insert(schema.orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.p.id,
        productSlug: l.p.slug,
        name: l.p.name,
        unitPriceCents: l.p.priceCents ?? 0,
        quantity: l.qty,
        lineTotalCents: l.total,
        vatRateBps: l.p.vatRateBps,
      })),
    );
  }
  console.log(`✓ orders: ${orderSeq} (${refundedTotal} rimborsati, ${partialCount} parziali)`);

  // ── Reservations ───────────────────────────────────────────────────────────
  const RES = 260;
  let noShows = 0;
  let forfeited = 0;
  for (let i = 0; i < RES; i++) {
    const past = chance(0.7);
    const date = past ? daysAgo(int(1, 200)) : new Date(NOW.getTime() + int(0, 45) * DAY);
    const type = weighted([["table", 5] as const, ["porchetta", 4] as const, ["order", 2] as const]);
    const customer = chance(0.5) ? pick(customers) : null;
    const name = customer?.name ?? `${pick(FIRST)} ${pick(LAST)}`;

    const status = past
      ? weighted([["completed", 62] as const, ["cancelled", 14] as const, ["no_show", 12] as const, ["confirmed", 12] as const])
      : weighted([["confirmed", 60] as const, ["pending", 40] as const]);
    if (status === "no_show") noShows++;

    // Deposits mostly on porchetta and larger tables.
    const hasDeposit = type === "porchetta" ? chance(0.45) : chance(0.15);
    const depositCents = hasDeposit ? pick([1000, 2000, 2500, 5000]) : 0;
    const depositPaidAt = hasDeposit && chance(0.8) ? new Date(date.getTime() - 2 * DAY) : null;
    const isForfeit = status === "no_show" && depositPaidAt != null;
    if (isForfeit) forfeited++;

    await db
      .insert(schema.reservations)
      .values({
        reference: `DEMO-${String(1000 + i)}`,
        type,
        name,
        phone: customer?.phone ?? `3${int(20, 89)}${String(int(1000000, 9999999))}`,
        email: customer?.email ?? (chance(0.7) ? `${slugify(name)}.r${i}@${DEMO_DOMAIN}` : null),
        date: iso(date),
        time: type === "porchetta" ? pick(["10:00", "10:30", "11:00", "11:30"]) : pick(["12:30", "13:00", "19:30", "20:00", "20:30"]),
        guests: type === "table" ? int(2, 10) : null,
        quantityKg: type === "porchetta" ? pick([0.5, 1, 1.5, 2, 3]) : null,
        shopSlug: pick(shopSlugs),
        notes: chance(0.2) ? pick(["Tavolo all'aperto se possibile", "Allergia ai crostacei", "Compleanno", "Seggiolone per bambino"]) : null,
        adminNotes: chance(0.12) ? pick(["Cliente abituale", "Confermato per telefono", "Richiamare"]) : null,
        status,
        userId: customer?.id ?? null,
        waitlisted: type === "porchetta" && chance(0.08),
        depositCents,
        depositPaidAt,
        depositForfeitedAt: isForfeit ? new Date(date.getTime() + DAY) : null,
        createdAt: new Date(date.getTime() - int(1, 21) * DAY),
      })
      .onConflictDoNothing({ target: schema.reservations.reference });
  }
  console.log(`✓ reservations: ${RES} (${noShows} no-show, ${forfeited} caparre trattenute)`);

  // ── Newsletter ─────────────────────────────────────────────────────────────
  const SOURCES = ["footer", "checkout", "porchetta", "evento", "in-bottega"];
  for (let i = 0; i < 400; i++) {
    const createdAt = daysAgo(int(1, 400));
    const status = weighted([["confirmed", 76] as const, ["pending", 14] as const, ["unsubscribed", 10] as const]);
    await db
      .insert(schema.newsletterSubscribers)
      .values({
        email: `iscritto${i}@${DEMO_DOMAIN}`,
        status,
        token: `demo-token-${i}`,
        source: pick(SOURCES),
        confirmedAt: status === "confirmed" ? new Date(createdAt.getTime() + 3_600_000) : null,
        createdAt,
      })
      .onConflictDoNothing({ target: schema.newsletterSubscribers.email });
  }
  console.log("✓ newsletter: 400 subscribers");

  // ── Rewards + redemptions ──────────────────────────────────────────────────
  const DEMO_REWARDS = [
    { slug: "demo-caffe-omaggio", name: "Caffè offerto", points: 100 },
    { slug: "demo-etto-ciauscolo", name: "Un etto di ciauscolo", points: 300 },
    { slug: "demo-bottiglia-verdicchio", name: "Bottiglia di Verdicchio", points: 900 },
    { slug: "demo-cena-due", name: "Degustazione per due", points: 1500 },
  ];
  for (const [i, r] of DEMO_REWARDS.entries()) {
    await db
      .insert(schema.rewards)
      .values({ ...r, description: `${r.name} — premio fedeltà.`, active: true, sortOrder: 10 + i, createdAt: daysAgo(300) })
      .onConflictDoNothing({ target: schema.rewards.slug });
  }
  const allRewards = await db.select().from(schema.rewards);
  const withCards = customers.slice(0, 70);
  for (let i = 0; i < 80; i++) {
    const u = pick(withCards);
    const r = pick(allRewards);
    const createdAt = daysAgo(int(1, 250));
    const status = weighted([["fulfilled", 62] as const, ["pending", 26] as const, ["cancelled", 12] as const]);
    await db.insert(schema.redemptions).values({
      userId: u.id,
      rewardId: r.id,
      rewardName: r.name,
      pointsSpent: r.points,
      status,
      createdAt,
      fulfilledAt: status === "fulfilled" ? new Date(createdAt.getTime() + DAY) : null,
    });
  }
  console.log(`✓ rewards: ${DEMO_REWARDS.length} new · 80 redemptions`);

  // ── Blog ───────────────────────────────────────────────────────────────────
  const TITLES = [
    ["La stagionatura del ciauscolo, mese per mese", "Storie"],
    ["Perché la porchetta si prenota entro il venerdì", "Bottega"],
    ["Vincisgrassi: la ricetta di nonna Elide", "Ricette"],
    ["Come tagliare il prosciutto a coltello", "Tecnica"],
    ["Il maiale marchigiano e i suoi allevatori", "Territorio"],
    ["Abbinare il Rosso Conero ai salumi stagionati", "Cantina"],
    ["Cosa cambia tra Casciotta e Caciotta", "Formaggi"],
    ["Il nostro Natale in bottega: cesti e prenotazioni", "Bottega"],
    ["Olive all'ascolana: friggerle come si deve", "Ricette"],
    ["Tre modi di usare il guanciale (che non sono la carbonara)", "Ricette"],
    ["Visita al Caseificio Esino", "Territorio"],
    ["Sottovuoto o carta: come conservare i salumi", "Tecnica"],
    ["Il banco dei formaggi si rinnova", "Bottega"],
    ["Pasqua 2026: agnello e crescia", "Bottega"],
  ];
  for (const [i, [title, category]] of TITLES.entries()) {
    const d = daysAgo(int(5, 380));
    await db
      .insert(schema.blogPosts)
      .values({
        slug: `demo-${slugify(title)}`.slice(0, 80),
        title,
        date: iso(d),
        category,
        excerpt: `${title} — appunti dalla norcineria.`,
        // Stored as one entry per paragraph, not a blob of text.
        content: [
          "Un racconto dalla bottega, senza fretta.",
          `${title}: quello che facciamo ogni giorno, spiegato come lo spiegheremmo al banco.`,
          "Passa a trovarci e assaggia — è il modo migliore per capirlo.",
        ],
        imageLabel: title,
        published: i < TITLES.length - 4, // last few stay drafts
        sortOrder: i,
        createdAt: d,
      })
      .onConflictDoNothing({ target: schema.blogPosts.slug });
  }
  console.log(`✓ blog: ${TITLES.length} articles (4 drafts)`);

  // ── Stock movements ────────────────────────────────────────────────────────
  const tracked = products.filter((p) => p.stock != null);
  for (let i = 0; i < 300; i++) {
    const p = pick(tracked);
    const delta = chance(0.6) ? int(5, 40) : -int(1, 8);
    await db.insert(schema.stockMovements).values({
      productId: p.id,
      delta,
      reason: delta > 0 ? pick(["Carico fornitore", "Rettifica inventario", "Reso cliente"]) : pick(["Scarto", "Rottura", "Assaggio banco", "Rettifica inventario"]),
      stockAfter: Math.max(0, (p.stock ?? 0) + int(-5, 20)),
      createdByUserId: actorId,
      createdAt: daysAgo(int(1, 240)),
    });
  }
  console.log("✓ stock movements: 300");

  // ── Analytics ──────────────────────────────────────────────────────────────
  const PATHS = ["/", "/negozio", "/porchetta", "/prenotazioni", "/sedi", "/blog", "/sedi/centro", "/negozio/demo-salame-di-fabriano", "/traccia", "/newsletter"];
  const REFS = [null, "https://www.google.com/", "https://www.instagram.com/", "https://www.facebook.com/", "https://www.tripadvisor.it/", null, null];
  const views: (typeof schema.pageViews.$inferInsert)[] = [];
  for (let i = 0; i < 6000; i++) {
    // More traffic recently and on weekends.
    const age = Math.floor(Math.pow(rand(), 1.5) * 180);
    views.push({ path: pick(PATHS), referrer: pick(REFS), createdAt: daysAgo(age) });
  }
  for (let i = 0; i < views.length; i += 500) {
    await db.insert(schema.pageViews).values(views.slice(i, i + 500));
  }
  console.log("✓ analytics: 6000 page views");

  // ── Audit log ──────────────────────────────────────────────────────────────
  const AUDIT = [
    ["order.refund", "order", "Rimborso di 42,00 € per l'ordine ORD-D10042"],
    ["order.status", "order", "Ordine ORD-D10108: paid → fulfilled"],
    ["product.update", "product", "Prodotto «Lonza stagionata» aggiornato"],
    ["product.stock", "product", "Scorte «Guanciale di Norcia»: +24"],
    ["reservation.status", "reservation", "Prenotazione DEMO-1042: confirmed → no_show"],
    ["reservation.promote", "reservation", "Prenotazione DEMO-1088 confermata dalla lista d'attesa"],
    ["user.role", "user", "Ruolo di Elisa Banconiera impostato su staff"],
    ["setting.update", "setting", "Impostazione «store.shippingCents» aggiornata"],
    ["discount.create", "discount", "Codice sconto DEMOBENVENUTO10 creato"],
    ["newsletter.broadcast", "newsletter", "Newsletter inviata a 304 iscritti"],
    ["loyalty.adjust", "loyalty", "Punti rettificati: +150"],
    ["blog_post.publish", "blog_post", "Articolo «La stagionatura del ciauscolo» pubblicato"],
  ];
  for (let i = 0; i < 400; i++) {
    const [action, entity, summary] = pick(AUDIT);
    await db.insert(schema.auditLog).values({
      actorId,
      actorName,
      action,
      entity,
      entityId: `demo-${int(1000, 9999)}`,
      summary,
      meta: { demo: true },
      createdAt: daysAgo(int(1, 300)),
    });
  }
  console.log("✓ audit log: 400 entries");

  // ── Email outbox ───────────────────────────────────────────────────────────
  for (let i = 0; i < 200; i++) {
    const status = weighted([["sent", 78] as const, ["queued", 12] as const, ["failed", 10] as const]);
    const createdAt = daysAgo(int(1, 90));
    await db.insert(schema.emailOutbox).values({
      toAddress: `iscritto${int(0, 399)}@${DEMO_DOMAIN}`,
      subject: pick(["Conferma ordine", "La tua porchetta è pronta", "Prenotazione confermata", "Newsletter di marzo", "Hai sbloccato un premio"]),
      text: "Messaggio dimostrativo.",
      html: "<p>Messaggio dimostrativo.</p>",
      status,
      attempts: status === "failed" ? int(1, 5) : 1,
      error: status === "failed" ? pick(["SMTP timeout", "550 mailbox unavailable", "Connection refused"]) : null,
      sentAt: status === "sent" ? createdAt : null,
      createdAt,
    });
  }
  console.log("✓ email outbox: 200");

  // ── Storefront dressing ────────────────────────────────────────────────────
  //
  // Placeholder copy so the public site demos as a finished shop rather than one
  // with holes in it. Everything here is **invented for the demo** and lives in
  // this script — never in `lib/data.ts` — precisely so a real seed can't pick it
  // up. All of it is editable from the gestionale, and all of it must be replaced
  // with the shop's real values before the site goes live.

  // Second location's hours were never confirmed, so the live site says so out
  // loud. Plausible market hours for the demo; the market closes Thursday
  // afternoons, which is the usual Ancona pattern.
  await db
    .update(schema.shops)
    .set({
      hours: [
        { label: "Lun – Mer, Ven – Sab", value: "7:00 – 13:30" },
        { label: "Giovedì", value: "7:00 – 13:00" },
        { label: "Domenica", value: "Chiuso" },
      ],
      hoursConfirmed: true,
    })
    .where(eq(schema.shops.slug, "carni"));
  console.log("✓ demo opening hours for the Mercato del Piano");

  // ── Settings that make the demo data meaningful ────────────────────────────
  for (const [key, value] of [
    ["porchetta.capacityKgPerDay", 40],
    ["store.lowStockThreshold", 5],
    ["store.shippingCents", 700],
    ["store.freeShippingThresholdCents", 6000],
    // The marquee needs enough names to actually travel. Real houses the shop
    // could plausibly carry — swap for their real supplier list.
    // The daily counter line. Invented for the demo — the shop rewrites it each
    // morning from the gestionale.
    [
      "home.today",
      "Porchetta calda dalle 9, Vincisgrassi in teglia, Ricotta di pecora di giornata, Olive all'ascolana fritte",
    ],
    [
      "home.brands",
      "Rineri, San Cesario, SIGI, Menchi, Villani, Caseificio Esino, Fattoria Petrini, Antica Norcineria Fabriano, Mielizia, Oleificio Conero",
    ],
    // Obvious placeholders: an eleven-digit run of ones could never be mistaken
    // for a real Partita IVA, so nobody ships it by accident. It is also
    // deliberately checksum-invalid (the check digit would have to be 5), and
    // that is now enforced rather than merely hoped for: `partitaIvaError`
    // refuses it on the settings form and again in the invoice route, so a demo
    // database cannot emit a complete-looking FatturaPA XML the SdI would
    // reject. Keep it invalid if you ever change it.
    ["business.legalName", "Norcineria Taccalite S.r.l. — DEMO"],
    ["business.vatNumber", "11111111111"],
  ] as const) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }

  console.log("\n✓ Demo data ready. Log in at /admin and have a look around.");
  console.log("  Re-run with `-- --reset` to clear and regenerate.");
}

main()
  .then(() => db?.$client.close())
  .catch((err) => {
    console.error(err);
    db?.$client.close();
    process.exit(1);
  });
