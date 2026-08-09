const Database = require("better-sqlite3");
const db = new Database("data/taccalite.db", { readonly: true });
const applied = db.prepare("select id, created_at from __drizzle_migrations order by created_at").all();
console.log("migrations applied:", applied.length, "| last created_at:", applied.at(-1)?.created_at);
const cols = (t) => db.prepare(`pragma table_info(${t})`).all().map((c) => c.name);
console.log("orders.refunded_cents:", cols("orders").includes("refunded_cents"));
console.log("orders.stripe_payment_intent_id:", cols("orders").includes("stripe_payment_intent_id"));
console.log("reservations.deposit_forfeited_at:", cols("reservations").includes("deposit_forfeited_at"));
console.log("row counts:", {
  orders: db.prepare("select count(*) n from orders").get().n,
  reservations: db.prepare("select count(*) n from reservations").get().n,
  products: db.prepare("select count(*) n from products").get().n,
  users: db.prepare("select count(*) n from users").get().n,
});
db.close();
