"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { inputCls, labelCls, Panel } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { addPointsByCard, redeemAtCounter, type CounterCredit } from "@/lib/admin/loyalty-actions";
import { updateRedemptionStatus } from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/action-state";
import { formatRelativeTime } from "@/lib/format";
import { pointsForEuros } from "@/lib/loyalty-rules";

/** What `/api/admin/loyalty/card` returns for a live card (dates as ISO strings). */
type Holder = {
  userId: string;
  name: string;
  points: number;
  cardNumber: string;
  lastAccrual: { delta: number; reason: string; createdAt: string | null } | null;
  pending: { id: string; rewardName: string; pointsSpent: number; createdAt: string | null }[];
  rewards: { id: string; name: string; points: number }[];
};

type Lookup =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "found"; holder: Holder; at: number }
  | { state: "error"; message: string };

/** A credit within this window is most likely the same receipt scanned twice. */
const RECENT_MS = 10 * 60_000;

/**
 * The counter screen for one card: confirm the holder, credit a purchase, hand
 * over what they've claimed, or claim something for them.
 *
 * The card is resolved as it's typed and every button stays disabled until a
 * real, active holder is on screen. The lookup is advisory — the actions
 * re-resolve the card server-side — so nothing here can talk them into a bad
 * credit. After a credit the form clears itself: the old version kept the card,
 * the amount and a stale balance on screen with a live button, so a second tap
 * credited the same receipt again.
 */
export function ScanForm({
  pointsPerEuro,
  enabled,
  card,
  onCardChange,
  inputRef,
}: {
  pointsPerEuro: number;
  /** `loyalty.enabled` — with the programme off, only accrual is suspended. */
  enabled: boolean;
  card: string;
  onCardChange: (card: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [euros, setEuros] = useState("");
  const [receipt, setReceipt] = useState("");
  // Bumped after a redemption or delivery so the same card is read again.
  const [version, setVersion] = useState(0);
  // What the last completed lookup found, tagged with the card and version it
  // answered for, so a slow reply for a card the operator has typed past can't
  // be shown as current.
  const [result, setResult] = useState<{ card: string; version: number; lookup: Lookup } | null>(null);
  const [lastCredit, setLastCredit] = useState<CounterCredit | null>(null);
  const eurosRef = useRef<HTMLInputElement>(null);

  const trimmed = card.trim();

  // Derived, not stored: "too short" and "still checking" are facts about the
  // text in the box; only the fetched answer is state.
  const lookup: Lookup =
    trimmed.length < 4
      ? { state: "idle" }
      : result?.card === trimmed && result.version === version
        ? result.lookup
        : { state: "checking" };

  useEffect(() => {
    if (trimmed.length < 4) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let lookup: Lookup;
      try {
        const res = await fetch(`/api/admin/loyalty/card?card=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        lookup = data.ok
          ? { state: "found", holder: data as Holder, at: Date.now() }
          : { state: "error", message: data.error ?? "Tessera non trovata." };
      } catch {
        lookup = { state: "error", message: "Verifica non riuscita." };
      }
      if (!cancelled) setResult({ card: trimmed, version, lookup });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, version]);

  const points = pointsForEuros(Number(euros), pointsPerEuro);
  const holder = lookup.state === "found" ? lookup.holder : null;
  const ready = enabled && holder != null && points > 0;

  const refresh = () => setVersion((v) => v + 1);

  function handleCredited(state: ActionState) {
    const credit = state.data as CounterCredit | undefined;
    if (credit) setLastCredit(credit);
    // Next customer: clean slate, cursor back on the card box for the scanner.
    onCardChange("");
    setEuros("");
    setReceipt("");
    setResult(null);
    inputRef?.current?.focus();
  }

  return (
    <Panel>
      <h2 className="font-display text-lg text-brown-950">Accredita un acquisto</h2>
      <p className="mt-1 mb-5 text-sm leading-relaxed text-brown-800/70">
        Inquadra il codice QR della tessera con lo scanner (oppure digita il numero) e inserisci
        l&apos;importo dello scontrino. Controlla il nome che compare prima di accreditare.
      </p>

      {lastCredit && (
        <p role="status" className="mb-5 rounded-xl bg-ok-soft px-4 py-2.5 text-sm text-ok-soft-fg">
          Ultimo accredito: <strong>+{lastCredit.added} punti</strong> a{" "}
          <strong>{lastCredit.name}</strong> (saldo {lastCredit.balance}) · tessera {lastCredit.card}
        </p>
      )}

      {/* The card box sits outside the accrual form: the holder block below it
          carries its own small forms (deliver, redeem), and forms can't nest. */}
      <div>
        <label htmlFor="card" className={labelCls}>
          Numero tessera
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brown-800/40" />
          <input
            ref={inputRef}
            id="card"
            value={card}
            onChange={(e) => onCardChange(e.target.value)}
            // A barcode scanner types the number and sends Enter: move on to
            // the amount instead of doing nothing.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                eurosRef.current?.focus();
              }
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="TAC-2026-000000"
            className={`${inputCls} pl-9 font-mono`}
          />
        </div>

        {/* The confirmation step: who is about to be credited. */}
        <div aria-live="polite" className="mt-2 min-h-10">
          {lookup.state === "checking" && <p className="text-xs text-brown-800/60">Verifica tessera…</p>}
          {lookup.state === "error" && <p className="text-sm font-semibold text-danger">{lookup.message}</p>}
          {lookup.state === "found" && <HolderCard holder={lookup.holder} now={lookup.at} onChanged={refresh} />}
        </div>
      </div>

      <ActionForm action={addPointsByCard} onSuccess={handleCredited} className="mt-5 space-y-5">
        <input type="hidden" name="card" value={trimmed} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
          <div>
            <label htmlFor="euros" className={labelCls}>
              Importo acquisto (€)
            </label>
            <input
              ref={eurosRef}
              id="euros"
              name="euros"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max="100000"
              value={euros}
              onChange={(e) => setEuros(e.target.value)}
              placeholder="0,00"
              className={inputCls}
              disabled={!enabled}
              required
            />
          </div>
          <div>
            <label htmlFor="receipt" className={labelCls}>
              Scontrino n. (facoltativo)
            </label>
            <input
              id="receipt"
              name="receipt"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              maxLength={40}
              autoComplete="off"
              className={inputCls}
              disabled={!enabled}
            />
          </div>
        </div>

        {ready && holder && (
          <p className="rounded-xl bg-ok-soft px-4 py-2.5 text-sm text-ok-soft-fg">
            Stai per accreditare <strong>+{points} punti</strong> a <strong>{holder.name}</strong> (nuovo
            saldo {holder.points + points}).
          </p>
        )}

        <PendingButton tone="gold" disabled={!ready}>
          Accredita punti
        </PendingButton>
        {!ready && (
          <p className="text-xs text-brown-800/60">
            {enabled
              ? "Inserisci una tessera valida e un importo che generi almeno un punto."
              : "Accredito sospeso: il programma fedeltà è disattivato."}
          </p>
        )}
      </ActionForm>
    </Panel>
  );
}

/** The holder block: identity, balance, last credit, and the rewards to hand over or claim. */
function HolderCard({ holder, now, onChanged }: { holder: Holder; now: number; onChanged: () => void }) {
  const last = holder.lastAccrual;
  const lastAt = last?.createdAt ? new Date(last.createdAt).getTime() : null;
  const recent = lastAt != null && now - lastAt < RECENT_MS;

  return (
    <div className="rounded-xl bg-gold/10 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-brown-950">{holder.name}</p>
          <p className="text-xs text-brown-800/70">
            Saldo attuale {holder.points} punti · tessera {holder.cardNumber}
          </p>
          <p className="text-xs text-brown-800/60">
            {last
              ? `Ultimo accredito +${last.delta}${lastAt != null ? ` · ${formatRelativeTime(lastAt, now)}` : ""} · ${last.reason}`
              : "Nessun accredito finora"}
          </p>
        </div>
        <Link
          href={`/admin/loyalty/${holder.userId}`}
          className="text-[11px] font-bold tracking-widest text-gold-dark uppercase hover:underline"
        >
          Scheda cliente →
        </Link>
      </div>

      {recent && (
        <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs font-semibold text-warn-soft-fg">
          Punti già accreditati {formatRelativeTime(lastAt ?? now, now)}: è lo stesso scontrino?
        </p>
      )}

      {holder.pending.length > 0 && (
        <div className="mt-3 border-t border-gold/30 pt-3">
          <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">Premi da consegnare</p>
          <ul className="mt-2 space-y-2">
            {holder.pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-brown-950">
                  {r.rewardName}{" "}
                  <span className="text-xs text-brown-800/60">
                    · {r.pointsSpent} punti
                    {r.createdAt ? ` · riscattato ${formatRelativeTime(r.createdAt, now)}` : ""}
                  </span>
                </span>
                <ActionForm action={updateRedemptionStatus} onSuccess={onChanged}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="fulfilled" />
                  <PendingButton tone="dark" confirm={`Segnare «${r.rewardName}» come consegnato a ${holder.name}?`}>
                    Consegnato
                  </PendingButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </div>
      )}

      {holder.rewards.length > 0 && (
        <div className="mt-3 border-t border-gold/30 pt-3">
          <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
            Riscattabili con il saldo attuale
          </p>
          <ul className="mt-2 space-y-2">
            {holder.rewards.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-brown-950">
                  {r.name} <span className="text-xs text-brown-800/60">· {r.points} punti</span>
                </span>
                <ActionForm action={redeemAtCounter} onSuccess={onChanged}>
                  <input type="hidden" name="card" value={holder.cardNumber} />
                  <input type="hidden" name="rewardId" value={r.id} />
                  <PendingButton
                    tone="gold"
                    confirm={`Scalare ${r.points} punti a ${holder.name} per «${r.name}»? Il premio risulta consegnato subito.`}
                  >
                    Riscatta
                  </PendingButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
