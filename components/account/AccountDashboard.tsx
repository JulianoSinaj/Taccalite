"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, TrendingUp, User } from "lucide-react";
import LoyaltyCard from "@/components/LoyaltyCard";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";

type Reward = { id: string; name: string; description: string; points: number; image: string | null };
type Tx = { id: string; delta: number; reason: string; balanceAfter: number; createdAt: string | Date };
type Order = {
  id: string;
  orderNumber: string;
  createdAt: string | Date;
  status: string;
  totalCents: number;
  fulfilment: string;
};
type Reservation = {
  id: string;
  reference: string;
  type: "table" | "porchetta" | "order";
  status: "pending" | "confirmed" | "completed" | "cancelled";
  waitlisted: boolean;
  date: string;
  time: string | null;
  quantityKg: number | null;
  name: string;
};
type Redemption = {
  id: string;
  rewardName: string;
  pointsSpent: number;
  status: "pending" | "fulfilled" | "cancelled";
  createdAt: string | Date;
};

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "In attesa", cls: "bg-amber-100 text-amber-800" },
  paid: { label: "Pagato", cls: "bg-emerald-100 text-emerald-800" },
  fulfilled: { label: "Consegnato", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Annullato", cls: "bg-red-100 text-red-700" },
  refunded: { label: "Rimborsato", cls: "bg-brown-900/10 text-brown-800" },
};

const RESERVATION_TYPE_LABEL: Record<Reservation["type"], string> = {
  table: "Tavolo / degustazione",
  porchetta: "Porchetta del sabato",
  order: "Ordine speciale",
};

const RESERVATION_STATUS: Record<Reservation["status"], { label: string; cls: string }> = {
  pending: { label: "In attesa", cls: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confermata", cls: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completata", cls: "bg-brown-900/10 text-brown-800" },
  cancelled: { label: "Annullata", cls: "bg-red-100 text-red-700" },
};

const REDEMPTION_STATUS: Record<Redemption["status"], { label: string; cls: string }> = {
  pending: { label: "Da ritirare", cls: "bg-amber-100 text-amber-800" },
  fulfilled: { label: "Ritirato", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Annullato", cls: "bg-red-100 text-red-700" },
};

const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

export default function AccountDashboard({
  name,
  points,
  cardNumber,
  qrSvg,
  nextReward,
  rewards,
  transactions,
  orders,
  reservations,
  redemptions,
}: {
  name: string;
  points: number;
  cardNumber: string;
  qrSvg?: string;
  nextReward: { name: string; points: number } | null;
  rewards: Reward[];
  transactions: Tx[];
  orders: Order[];
  reservations: Reservation[];
  redemptions: Redemption[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const missing = nextReward ? Math.max(0, nextReward.points - points) : 0;
  const pct = nextReward && nextReward.points > 0 ? Math.min(100, Math.round((points / nextReward.points) * 100)) : 100;

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  async function redeem(reward: Reward) {
    setBusyId(reward.id);
    setMessage(null);
    try {
      const res = await fetch("/api/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId: reward.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setMessage({ kind: "ok", text: `Premio "${reward.name}" riscattato! Ritiralo in negozio.` });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Errore imprevisto" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Hero + card */}
      <section className="relative overflow-hidden bg-brown-900 px-5 pt-40 pb-24 sm:px-10 sm:pt-48 sm:pb-32">
        <div className="parallax-orb absolute -top-40 -left-40 h-[60rem] w-[60rem] opacity-10" />
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center">
          <Reveal className="mb-14 space-y-4 text-center">
            <span className="eyebrow block">Benvenuto, {name.split(" ")[0]}</span>
            <h1 className="font-display text-4xl tracking-tighter text-white sm:text-6xl">
              Il tuo Club Taccalite
            </h1>
          </Reveal>
          <Reveal delay={0.15} className="w-full">
            <LoyaltyCard
              name={name}
              points={points}
              nextRewardPoints={nextReward?.points ?? null}
              cardNumber={cardNumber}
              qrSvg={qrSvg}
            />
          </Reveal>
          <Reveal delay={0.25} className="mt-10">
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="rounded-full border border-white/25 px-6 py-2.5 text-xs font-bold tracking-widest text-cream/80 uppercase transition-colors hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? "Uscita…" : "Esci"}
            </button>
          </Reveal>
        </div>
      </section>

      {/* Profile + stats */}
      <section className="bg-cream px-5 py-16 sm:px-10 sm:py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="space-y-6 lg:col-span-7">
            {/* TODO (follow-up, out of scope): profile editing (name/email/phone) and
                change-password go here — they need dedicated server mutation actions. */}
            <Reveal className="card-shadow-soft flex flex-col items-center gap-6 rounded-3xl border border-brown-900/10 bg-white/50 p-6 sm:p-8 md:flex-row">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white bg-cream-dark shadow-md">
                <User className="size-9 text-brown-900/40" />
              </div>
              <div className="flex-1 space-y-3 text-center md:text-left">
                <div className="space-y-0.5">
                  <h4 className="font-display text-2xl text-brown-950">{name}</h4>
                  <p className="text-sm font-medium text-brown-800/75">Cliente Taccalite · #{cardNumber}</p>
                </div>
                <p className="text-sm leading-relaxed text-brown-900/75">
                  Presenta la tua scheda in negozio ad ogni acquisto per accumulare punti e
                  riscattare i premi del club.
                </p>
              </div>
            </Reveal>

            <Reveal className="card-shadow-soft rounded-3xl border border-brown-900/10 bg-white/50 p-6 sm:p-8">
              <div className="mb-4 flex items-baseline justify-between border-b border-brown-900/10 pb-4">
                <h3 className="font-display text-2xl tracking-tight text-brown-950">
                  Movimenti punti
                </h3>
                {transactions.length > 0 && (
                  <p className="text-xs font-semibold tracking-widest text-brown-800/60 uppercase">
                    {transactions.length} {transactions.length === 1 ? "movimento" : "movimenti"}
                  </p>
                )}
              </div>
              {transactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-brown-900/70">
                  Non hai ancora movimenti. I punti compaiono qui ad ogni acquisto in negozio.
                </p>
              ) : (
                <ul className="divide-y divide-brown-900/10">
                  {transactions.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between gap-4 py-3.5">
                      <div>
                        <p className="text-sm font-semibold text-brown-950">{tx.reason || "Movimento"}</p>
                        <p className="text-xs text-brown-800/60">
                          {new Date(tx.createdAt).toLocaleDateString("it-IT", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span
                        className={`font-display text-lg font-bold tabular-nums ${
                          tx.delta >= 0 ? "text-gold-deep" : "text-red-700"
                        }`}
                      >
                        {tx.delta >= 0 ? "+" : ""}
                        {tx.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>

            <Reveal className="card-shadow-soft rounded-[28px] border border-brown-900/10 bg-white/50 p-8 sm:p-10">
              <h3 className="font-display mb-6 text-3xl tracking-tight text-brown-950">I tuoi ordini</h3>
              {orders.length === 0 ? (
                <p className="text-brown-900/70">
                  Non hai ancora ordini. Scopri il{" "}
                  <Link href="/negozio" className="font-semibold text-brown-950 underline">
                    negozio online
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-brown-900/10">
                  {orders.map((o) => {
                    const st = ORDER_STATUS[o.status] ?? {
                      label: o.status,
                      cls: "bg-brown-900/10 text-brown-800",
                    };
                    return (
                      <li key={o.id}>
                        <Link
                          href={`/account/ordini/${o.orderNumber}`}
                          className="group -mx-3 flex items-center justify-between gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-brown-900/5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-brown-950 group-hover:text-gold-deep">
                              {o.orderNumber}
                              <span className="ml-2 text-xs font-normal text-brown-800/60">
                                {o.fulfilment === "pickup" ? "Ritiro" : "Spedizione"}
                              </span>
                            </p>
                            <p className="text-xs text-brown-800/60">
                              {new Date(o.createdAt).toLocaleDateString("it-IT", dateFmt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${st.cls}`}
                            >
                              {st.label}
                            </span>
                            <span className="font-display text-lg font-bold text-brown-950">
                              € {(o.totalCents / 100).toFixed(2)}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-brown-900/30 transition-transform group-hover:translate-x-0.5 group-hover:text-brown-900/60" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>

            {/* Reservation history */}
            <Reveal className="card-shadow-soft rounded-[28px] border border-brown-900/10 bg-white/50 p-8 sm:p-10">
              <h3 className="font-display mb-6 text-3xl tracking-tight text-brown-950">
                Le tue prenotazioni
              </h3>
              {reservations.length === 0 ? (
                <p className="text-brown-900/70">
                  Nessuna prenotazione ancora. Prenota un{" "}
                  <Link href="/prenotazioni" className="font-semibold text-brown-950 underline">
                    tavolo o una porchetta
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-brown-900/10">
                  {reservations.map((r) => {
                    const st = RESERVATION_STATUS[r.status];
                    const detail =
                      r.quantityKg != null
                        ? `${r.quantityKg} kg`
                        : r.time
                          ? `${r.date} · ${r.time}`
                          : r.date;
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/traccia?ref=${encodeURIComponent(r.reference)}`}
                          className="group -mx-3 flex items-center justify-between gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-brown-900/5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-brown-950 group-hover:text-gold-deep">
                              {RESERVATION_TYPE_LABEL[r.type]}
                            </p>
                            <p className="text-xs text-brown-800/60">
                              {detail} · Rif. {r.reference}
                            </p>
                            {r.waitlisted && r.status !== "cancelled" && (
                              <p className="mt-1 text-xs font-medium text-gold-deep">
                                In lista d&apos;attesa
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${st.cls}`}
                            >
                              {st.label}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-brown-900/30 transition-transform group-hover:translate-x-0.5 group-hover:text-brown-900/60" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>

            {/* Redemption history */}
            <Reveal className="card-shadow-soft rounded-[28px] border border-brown-900/10 bg-white/50 p-8 sm:p-10">
              <h3 className="font-display mb-6 text-3xl tracking-tight text-brown-950">
                Premi riscattati
              </h3>
              {redemptions.length === 0 ? (
                <p className="text-brown-900/70">
                  Non hai ancora riscattato premi. Sfoglia il catalogo fedeltà qui sotto.
                </p>
              ) : (
                <ul className="divide-y divide-brown-900/10">
                  {redemptions.map((r) => {
                    const st = REDEMPTION_STATUS[r.status];
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-4 py-3.5">
                        <div>
                          <p className="text-sm font-semibold text-brown-950">{r.rewardName}</p>
                          <p className="text-xs text-brown-800/60">
                            {new Date(r.createdAt).toLocaleDateString("it-IT", dateFmt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${st.cls}`}
                          >
                            {st.label}
                          </span>
                          <span className="font-display text-lg font-bold text-red-700 tabular-nums">
                            −{r.pointsSpent}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>
          </div>

          <div className="space-y-6 lg:sticky lg:top-24 lg:col-span-5">
            <Reveal delay={0.1} className="card-shadow-soft rounded-3xl border border-brown-900/10 bg-white/60 p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <TrendingUp className="size-5 text-gold-dark" />
                <h5 className="text-[11px] font-bold tracking-[0.3em] text-brown-950 uppercase">
                  Il tuo saldo punti
                </h5>
              </div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-display text-6xl leading-none text-brown-950 tabular-nums">{points}</p>
                  <p className="mt-2 text-xs font-medium tracking-widest text-brown-800/60 uppercase">
                    Punti raccolti
                  </p>
                </div>
                {nextReward && (
                  <div className="text-right">
                    <p className="font-display text-2xl leading-none text-brown-800/80 tabular-nums">
                      {nextReward.points}
                    </p>
                    <p className="mt-2 text-xs font-medium tracking-widest text-brown-800/60 uppercase">
                      Prossimo premio
                    </p>
                  </div>
                )}
              </div>
              {nextReward && (
                <div className="mt-6 border-t border-brown-900/10 pt-5">
                  <div className="mb-2 flex items-baseline justify-between gap-4 text-[10px] font-bold tracking-widest text-brown-900/80 uppercase">
                    <p className="truncate">{nextReward.name}</p>
                    <p className="shrink-0">{missing} pt mancanti</p>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-brown-950/10">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </Reveal>

            <Reveal delay={0.2} className="cinematic-shadow space-y-4 rounded-3xl bg-brown-950 p-6 text-white sm:p-8">
              <h5 className="text-[11px] font-bold tracking-[0.3em] text-gold uppercase">
                Vuoi accumulare più punti?
              </h5>
              <p className="text-sm font-light leading-relaxed text-cream/75">
                Prenota un tavolo per una degustazione: ogni visita ti avvicina al prossimo premio.
              </p>
              <Link
                href="/prenotazioni"
                data-magnetic
                className="inline-flex w-full items-center justify-center rounded-full bg-gold px-6 py-3.5 text-xs font-bold tracking-widest text-brown-950 uppercase shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark"
              >
                Prenota un tavolo
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Rewards catalogue */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-24 sm:px-10 sm:py-32">
        <div className="relative z-10 mx-auto max-w-7xl">
          <Reveal className="mb-12 flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div className="space-y-6">
              <span className="eyebrow block">I premi disponibili</span>
              <h2 className="font-display text-4xl tracking-tighter text-white sm:text-5xl md:text-7xl">
                Catalogo fedeltà
              </h2>
            </div>
            <p className="max-w-md text-lg leading-relaxed text-cream/70">
              Accumula punti e riscatta le eccellenze del nostro territorio.
            </p>
          </Reveal>

          {message && (
            <div
              className={`mb-10 rounded-2xl px-6 py-4 text-sm font-semibold ${
                message.kind === "ok" ? "bg-gold/20 text-gold" : "bg-red-500/15 text-red-300"
              }`}
            >
              {message.text}
            </div>
          )}

          <RevealStagger className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
            {rewards.map((reward) => {
              const canRedeem = points >= reward.points;
              return (
                <RevealStaggerItem key={reward.id} className="group flex flex-col">
                  <div className="cinematic-shadow relative mb-8 aspect-[4/3] overflow-hidden rounded-[24px] bg-brown-900">
                    {reward.image ? (
                      <Image
                        src={reward.image}
                        alt={reward.name}
                        fill
                        className="object-cover transition-transform duration-[1.5s] group-hover:scale-110"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center font-display text-xl text-cream/50">
                        {reward.name}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-brown-950/80 via-transparent to-transparent" />
                    <div className="absolute bottom-6 left-6">
                      <p className="font-display text-2xl font-bold text-gold">
                        {reward.points}{" "}
                        <span className="font-sans text-xs tracking-widest uppercase">punti</span>
                      </p>
                    </div>
                  </div>
                  <h4 className="font-display mb-2 text-2xl text-white">{reward.name}</h4>
                  <p className="mb-6 flex-1 text-sm leading-relaxed text-cream/70">{reward.description}</p>
                  <button
                    type="button"
                    disabled={!canRedeem || busyId === reward.id}
                    onClick={() => redeem(reward)}
                    className={`rounded-full px-6 py-3 text-xs font-bold tracking-widest uppercase transition-all ${
                      canRedeem
                        ? "bg-gold text-brown-950 hover:bg-gold-dark"
                        : "cursor-not-allowed border border-white/15 text-cream/40"
                    }`}
                  >
                    {busyId === reward.id
                      ? "Attendere…"
                      : canRedeem
                        ? "Riscatta"
                        : `Ti mancano ${reward.points - points} punti`}
                  </button>
                </RevealStaggerItem>
              );
            })}
          </RevealStagger>
        </div>
      </section>
    </div>
  );
}
