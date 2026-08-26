"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, User } from "lucide-react";
import LoyaltyCard from "@/components/LoyaltyCard";
import StatusChip, { TONE, type Tone } from "@/components/account/StatusChip";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { FULFILMENT_SHORT, type FulfilmentMode } from "@/lib/fulfilment";

type Reward = {
  id: string;
  name: string;
  description: string;
  points: number;
  image: string | null;
  /** Set when the reward can't be claimed at all — sold out, or out of window. */
  unavailable: "not_yet" | "expired" | "out_of_stock" | null;
};

const REWARD_UNAVAILABLE_LABEL: Record<NonNullable<Reward["unavailable"]>, string> = {
  not_yet: "Non ancora disponibile",
  expired: "Non più disponibile",
  out_of_stock: "Esaurito",
};
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
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
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

/**
 * Which tone each status carries. The mapping is deliberately the same one
 * `components/admin/ui.tsx` uses for these very statuses — an operator and a
 * customer looking at one booking should not be reading two different colour
 * languages. The chip that draws them lives in `./StatusChip`.
 */
const ORDER_STATUS: Record<string, { label: string; cls: Tone }> = {
  pending: { label: "In attesa", cls: TONE.waiting },
  paid: { label: "Pagato", cls: TONE.good },
  fulfilled: { label: "Consegnato", cls: TONE.good },
  cancelled: { label: "Annullato", cls: TONE.bad },
  refunded: { label: "Rimborsato", cls: TONE.neutral },
};

const RESERVATION_TYPE_LABEL: Record<Reservation["type"], string> = {
  table: "Tavolo / degustazione",
  porchetta: "Porchetta del sabato",
  order: "Ordine speciale",
};

const RESERVATION_STATUS: Record<Reservation["status"], { label: string; cls: Tone }> = {
  pending: { label: "In attesa", cls: TONE.waiting },
  confirmed: { label: "Confermata", cls: TONE.good },
  completed: { label: "Completata", cls: TONE.neutral },
  cancelled: { label: "Annullata", cls: TONE.bad },
  // Shown to the customer rather than hidden: if a deposit was kept, they are
  // entitled to see why on their own account page.
  no_show: { label: "Non ritirata", cls: TONE.missed },
};

const REDEMPTION_STATUS: Record<Redemption["status"], { label: string; cls: Tone }> = {
  pending: { label: "Da ritirare", cls: TONE.waiting },
  fulfilled: { label: "Ritirato", cls: TONE.good },
  cancelled: { label: "Annullato", cls: TONE.bad },
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
  emailVerified,
  claimed,
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
  /** Null when the account has no address at all — a counter-created card. */
  emailVerified: boolean | null;
  /** Set right after a verification link landed, so the page can report what
   *  the click actually did rather than leaving the customer to spot it. */
  claimed: { orders: number; points: number } | null;
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
      <section className="relative overflow-hidden bg-brown-900 px-5 pt-40 pb-24 sm:px-8 lg:px-12 sm:pt-48 sm:pb-32">
        <div className="parallax-orb absolute -top-40 -left-40 h-[60rem] w-[60rem] opacity-10" />
        <div className="relative z-10 mx-auto flex max-w-[88rem] flex-col items-center">
          <Reveal className="mb-14 space-y-4 text-center">
            <span className="eyebrow block">Benvenuto, {name.split(" ")[0]}</span>
            <h1 className="font-display text-4xl tracking-[-0.028em] text-cream sm:text-6xl">
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
              className="rounded-full border border-white/25 px-6 py-2.5 text-xs font-bold tracking-widest text-cream/80 uppercase transition-colors hover:border-white/50 hover:text-cream disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? "Uscita…" : "Esci"}
            </button>
          </Reveal>
        </div>
      </section>

      {/*
        Profile + stats.

        This was a 7/5 split with the four history cards stacked down the left
        and two short cards in a `sticky` right rail. Those two cards run to
        about 380px; the stack runs to about 1,100 — so on any desktop the right
        five twelfths of the page was ~600px of empty cream, which is more of the
        screen than the loyalty card above it gets. A sticky rail is for
        something you consult *while* reading past it, and a balance you have
        already read is not that.

        So: one band across the full width for the things you check at a glance
        (who you are, what you have, what to do next), then the history in two
        columns that actually fill the measure.
      */}
      <section className="bg-cream px-5 py-16 sm:px-8 lg:px-12 sm:py-24">
        <div className="mx-auto max-w-[88rem] space-y-6">
          {/* The verification click happens in a redirect, so without this the
              customer lands on a page that looks identical to before and has
              to work out for themselves whether anything happened. */}
          {claimed && (
            <Reveal className="border border-gold-dark/40 bg-gold/15 px-5 py-4">
              <p className="text-sm font-semibold text-brown-950">Indirizzo confermato</p>
              <p className="mt-1 text-sm text-brown-800">
                {claimed.orders > 0
                  ? `Abbiamo collegato ${claimed.orders} ${
                      claimed.orders === 1 ? "ordine" : "ordini"
                    } fatti con questo indirizzo${
                      claimed.points > 0 ? `, con ${claimed.points} punti fedeltà` : ""
                    }.`
                  : "Ora puoi reimpostare la password da solo se ti serve."}
              </p>
            </Reveal>
          )}

          {/* The one state where things silently do not work: recovery is
              impossible and past guest orders stay unclaimed until the address
              is proven. Worth a line on the page the customer actually opens. */}
          {emailVerified === false && (
            <Reveal className="border border-danger/30 bg-danger-soft px-5 py-4">
              <p className="text-sm font-semibold text-danger-soft-fg">
                Conferma il tuo indirizzo email
              </p>
              <p className="mt-1 text-sm text-danger-soft-fg/90">
                Serve per reimpostare la password e per ritrovare gli ordini fatti prima di
                registrarti.{" "}
                <Link href="/account/impostazioni" className="underline">
                  Invia di nuovo il link
                </Link>
                .
              </p>
            </Reveal>
          )}

          {/* The summary band. One hairlined box divided into three, rather than
              three floating cards: who you are, where you are against the next
              premio, and the two things to do about it. Divided by rules and not
              by gaps because the three are one statement — the balance is
              meaningless without the name on the card it belongs to. */}
          <Reveal className="border border-rule bg-paper">
            <div className="grid grid-cols-1 divide-y divide-rule lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.85fr)] lg:divide-x lg:divide-y-0">
              {/* Identity */}
              <div className="flex items-start gap-4 p-6 sm:p-8">
                <span
                  aria-hidden
                  className="flex size-12 shrink-0 items-center justify-center border border-rule-strong bg-paper-warm"
                >
                  <User className="size-5 text-taupe" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display truncate text-2xl leading-tight text-brown-950">
                    {name}
                  </h2>
                  {/* The card number is the thing staff ask for at the banco, so
                      it is set in the same tabular figures as the card itself
                      rather than buried in a sentence. */}
                  <p className="mt-1 text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase tabular-nums">
                    Socio · #{cardNumber}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-brown-700">
                    Mostra la scheda in bottega a ogni acquisto per accumulare punti.
                  </p>
                </div>
              </div>

              {/* Balance + progress */}
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-display text-5xl leading-none text-brown-950 tabular-nums sm:text-6xl">
                      {points}
                    </p>
                    <p className="mt-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase">
                      Punti raccolti
                    </p>
                  </div>
                  {nextReward && (
                    <div className="text-right">
                      <p className="font-display text-2xl leading-none text-brown-700 tabular-nums">
                        {nextReward.points}
                      </p>
                      <p className="mt-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase">
                        Prossimo premio
                      </p>
                    </div>
                  )}
                </div>
                {nextReward && (
                  <div className="mt-6">
                    <div className="mb-2 flex items-baseline justify-between gap-4 text-[0.6875rem] font-bold tracking-[0.16em] text-brown-700 uppercase">
                      <p className="truncate">{nextReward.name}</p>
                      <p className="shrink-0 tabular-nums">{missing} pt mancanti</p>
                    </div>
                    {/* Square, like every other measure on the storefront. */}
                    <div
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progresso verso ${nextReward.name}`}
                      className="h-1.5 w-full overflow-hidden bg-brown-950/10"
                    >
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {/* What to do next */}
              <div className="flex flex-col justify-center gap-2.5 p-6 sm:p-8">
                <Link
                  href="/prenotazioni"
                  className="tap flex items-center justify-between gap-3 border border-brown-950 bg-brown-950 px-5 py-3.5 text-[0.6875rem] font-bold tracking-[0.16em] text-cream uppercase transition-colors hover:bg-brown-800 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:outline-none"
                >
                  Prenota un tavolo
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                </Link>
                <Link
                  href="/negozio"
                  className="tap flex items-center justify-between gap-3 border border-rule-strong px-5 py-3.5 text-[0.6875rem] font-bold tracking-[0.16em] text-brown-800 uppercase transition-colors hover:border-brown-950 hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:outline-none"
                >
                  Ordina online
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                </Link>
                <Link
                  href="/account/impostazioni"
                  className="tap flex items-center justify-between gap-3 border border-rule-strong px-5 py-3.5 text-[0.6875rem] font-bold tracking-[0.16em] text-brown-800 uppercase transition-colors hover:border-brown-950 hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:outline-none"
                >
                  Impostazioni
                  {emailVerified === false && (
                    <span
                      aria-label="Indirizzo email da confermare"
                      className="size-2 shrink-0 rounded-full bg-danger"
                    />
                  )}
                </Link>
              </div>
            </div>
          </Reveal>

          {/* The history, in two columns that fill the width instead of one
              column and a void. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal className="border border-rule bg-paper p-6 sm:p-8">
              <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-4">
                <h3 className="font-display text-2xl tracking-tight text-brown-950">
                  Movimenti punti
                </h3>
                {transactions.length > 0 && (
                  <p className="text-xs font-semibold tracking-widest text-taupe uppercase">
                    {transactions.length} {transactions.length === 1 ? "movimento" : "movimenti"}
                  </p>
                )}
              </div>
              {transactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-brown-700">
                  Non hai ancora movimenti. I punti compaiono qui ad ogni acquisto in negozio.
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {/* One row at every width. Stacked, the delta landed on its own
                      line under the date, so each movement cost three lines of a
                      phone screen to say six characters. */}
                  {transactions.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between gap-4 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-brown-950">
                          {tx.reason || "Movimento"}
                        </p>
                        <p className="text-xs text-taupe">
                          {new Date(tx.createdAt).toLocaleDateString("it-IT", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span
                        className={`font-display shrink-0 text-lg font-bold tabular-nums ${
 tx.delta >= 0 ? "text-gold-deep" : "text-danger"
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

            <Reveal className="border border-rule bg-paper p-6 sm:p-8">
              {/* Every card in this grid states its heading the same way — a
                  `text-2xl` display line over a rule, with the count on the
                  right. They used to run at three different sizes and three
                  different paddings, so four sibling cards read as four
                  unrelated widgets. */}
              <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-4">
                <h3 className="font-display text-2xl tracking-tight text-brown-950">I tuoi ordini</h3>
                {orders.length > 0 && (
                  <p className="text-xs font-semibold tracking-widest text-taupe uppercase tabular-nums">
                    {orders.length} {orders.length === 1 ? "ordine" : "ordini"}
                  </p>
                )}
              </div>
              {orders.length === 0 ? (
                <p className="text-brown-700">
                  Non hai ancora ordini. Scopri il{" "}
                  <Link href="/negozio" className="font-semibold text-brown-950 underline">
                    negozio online
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {orders.map((o) => {
                    const st = ORDER_STATUS[o.status] ?? {
                      label: o.status,
                      cls: "bg-brown-900/10 text-brown-800",
                    };
                    return (
                      <li key={o.id}>
                        <Link
                          href={`/account/ordini/${o.orderNumber}`}
                          className="group -mx-3 flex flex-col gap-2 px-3 py-3 transition-colors hover:bg-brown-900/5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                        >
                          <div>
                            <p className="text-sm font-semibold text-brown-950 group-hover:text-gold-deep">
                              {o.orderNumber}
                              <span className="ml-2 text-xs font-normal text-taupe">
                                {FULFILMENT_SHORT[o.fulfilment as FulfilmentMode] ?? o.fulfilment}
                              </span>
                            </p>
                            <p className="text-xs text-taupe">
                              {new Date(o.createdAt).toLocaleDateString("it-IT", dateFmt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 sm:shrink-0">
                            <StatusChip tone={st.cls}>{st.label}</StatusChip>
                            <span className="font-display text-lg font-bold text-brown-950 tabular-nums">
                              € {(o.totalCents / 100).toFixed(2)}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-taupe transition-transform group-hover:translate-x-0.5 group-hover:text-brown-700" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>

            {/* Reservation history */}
            <Reveal className="border border-rule bg-paper p-6 sm:p-8">
              <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-4">
                <h3 className="font-display text-2xl tracking-tight text-brown-950">
                  Le tue prenotazioni
                </h3>
                {reservations.length > 0 && (
                  <p className="text-xs font-semibold tracking-widest text-taupe uppercase tabular-nums">
                    {reservations.length}
                  </p>
                )}
              </div>
              {reservations.length === 0 ? (
                <p className="text-brown-700">
                  Nessuna prenotazione ancora. Prenota un{" "}
                  <Link href="/prenotazioni" className="font-semibold text-brown-950 underline">
                    tavolo o una porchetta
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {reservations.map((r) => {
                    const st = RESERVATION_STATUS[r.status];
                    // `r.date` is stored ISO (`2026-07-02`) and was printed
                    // raw, so this was the one list on the page still showing a
                    // machine date next to four others reading "2 luglio 2026".
                    // Parsed as a local date rather than through `new Date(iso)`,
                    // which reads a bare yyyy-mm-dd as UTC midnight and so shows
                    // the previous day for anyone west of Greenwich.
                    const [yy, mm, dd] = r.date.split("-").map(Number);
                    const niceDate = Number.isFinite(yy)
                      ? new Date(yy, (mm ?? 1) - 1, dd ?? 1).toLocaleDateString("it-IT", dateFmt)
                      : r.date;
                    const detail =
                      r.quantityKg != null
                        ? `${r.quantityKg} kg`
                        : r.time
                          ? `${niceDate} · ${r.time}`
                          : niceDate;
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/traccia?ref=${encodeURIComponent(r.reference)}`}
                          className="group -mx-3 flex flex-col gap-2 px-3 py-3 transition-colors hover:bg-brown-900/5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                        >
                          <div>
                            <p className="text-sm font-semibold text-brown-950 group-hover:text-gold-deep">
                              {RESERVATION_TYPE_LABEL[r.type]}
                            </p>
                            <p className="text-xs text-taupe">
                              {detail} · Rif. {r.reference}
                            </p>
                            {r.waitlisted && r.status !== "cancelled" && (
                              <p className="mt-1 text-xs font-medium text-gold-deep">
                                In lista d&apos;attesa
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 sm:shrink-0">
                            <StatusChip tone={st.cls}>{st.label}</StatusChip>
                            <ChevronRight className="size-4 shrink-0 text-taupe transition-transform group-hover:translate-x-0.5 group-hover:text-brown-700" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>

            {/* Redemption history */}
            <Reveal className="border border-rule bg-paper p-6 sm:p-8">
              <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-4">
                <h3 className="font-display text-2xl tracking-tight text-brown-950">
                  Premi riscattati
                </h3>
                {redemptions.length > 0 && (
                  <p className="text-xs font-semibold tracking-widest text-taupe uppercase tabular-nums">
                    {redemptions.length}
                  </p>
                )}
              </div>
              {redemptions.length === 0 ? (
                <p className="text-brown-700">
                  Non hai ancora riscattato premi. Sfoglia il catalogo fedeltà qui sotto.
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {redemptions.map((r) => {
                    const st = REDEMPTION_STATUS[r.status];
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-4 py-3.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-brown-950">
                            {r.rewardName}
                          </p>
                          <p className="text-xs text-taupe">
                            {new Date(r.createdAt).toLocaleDateString("it-IT", dateFmt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 sm:shrink-0">
                          <StatusChip tone={st.cls}>{st.label}</StatusChip>
                          <span className="font-display text-lg font-bold text-danger tabular-nums">
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
        </div>
      </section>

      {/* Rewards catalogue */}
      <section className="relative overflow-hidden bg-brown-950 px-5 py-24 sm:px-8 lg:px-12 sm:py-32">
        <div className="relative z-10 mx-auto max-w-[88rem]">
          <Reveal className="mb-12 flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div className="space-y-6">
              <span className="eyebrow block">I premi disponibili</span>
              <h2 className="font-display text-4xl tracking-[-0.028em] text-cream sm:text-5xl md:text-7xl">
                Catalogo fedeltà
              </h2>
            </div>
            <p className="max-w-md text-lg leading-relaxed text-cream/70">
              Accumula punti e riscatta le eccellenze del nostro territorio.
            </p>
          </Reveal>

          {message && (
            <div
              className={`mb-10 px-6 py-4 text-sm font-semibold ${
 message.kind === "ok" ? "bg-gold/20 text-gold" : "bg-red-500/15 text-red-300"
 }`}
            >
              {message.text}
            </div>
          )}

          <RevealStagger className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
            {rewards.map((reward) => {
              // Two different "no": not enough points (keep saving) and not
              // available at all (nothing you can do). They used to be one —
              // a sold-out reward showed "Riscatta" and failed on click.
              const blocked = reward.unavailable;
              const canRedeem = !blocked && points >= reward.points;
              return (
                <RevealStaggerItem key={reward.id} className="group flex flex-col">
                  <div
                    className={`cinematic-shadow relative mb-8 aspect-[4/3] overflow-hidden bg-brown-900 ${
                      blocked ? "opacity-50 grayscale" : ""
                    }`}
                  >
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
                    {blocked && (
                      <span className="absolute top-4 right-4 rounded-full bg-brown-950/85 px-3 py-1.5 text-[11px] font-bold tracking-widest text-cream uppercase">
                        {REWARD_UNAVAILABLE_LABEL[blocked]}
                      </span>
                    )}
                  </div>
                  <h4 className="font-display mb-2 text-2xl text-cream">{reward.name}</h4>
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
                      : blocked
                        ? REWARD_UNAVAILABLE_LABEL[blocked]
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
