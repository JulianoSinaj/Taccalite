"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { inputCls, labelCls, Panel } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { addPointsByCard } from "@/lib/admin/loyalty-actions";

type Holder =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "found"; name: string; points: number; cardNumber: string }
  | { state: "error"; message: string };

/**
 * In-shop points accrual, with the holder confirmed before anything is credited.
 *
 * The old form submitted blind: type a card number, type an amount, points land
 * somewhere. A mistyped digit silently credited a stranger, and nothing on
 * screen ever named the person being credited. Here the card is resolved as it's
 * typed and the submit button stays disabled until a real, active holder is on
 * screen.
 *
 * The lookup is advisory — `addPointsByCard` re-resolves the card server-side
 * and refuses inactive accounts, so nothing here can talk it into a bad credit.
 */
export function ScanForm({ pointsPerEuro }: { pointsPerEuro: number }) {
  const [card, setCard] = useState("");
  const [euros, setEuros] = useState("");
  const [holder, setHolder] = useState<Holder>({ state: "idle" });

  const trimmed = card.trim();

  useEffect(() => {
    if (trimmed.length < 4) {
      setHolder({ state: "idle" });
      return;
    }
    let cancelled = false;
    setHolder({ state: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/loyalty/card?card=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (cancelled) return;
        setHolder(
          data.ok
            ? { state: "found", name: data.name, points: data.points, cardNumber: data.cardNumber }
            : { state: "error", message: data.error ?? "Tessera non trovata." },
        );
      } catch {
        if (!cancelled) setHolder({ state: "error", message: "Verifica non riuscita." });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const amount = Number(euros.replace(",", "."));
  const points = Number.isFinite(amount) && amount > 0 ? Math.floor(amount * pointsPerEuro) : 0;
  const ready = holder.state === "found" && points > 0;

  return (
    <Panel className="max-w-xl">
      <p className="mb-6 text-sm leading-relaxed text-brown-800/70">
        Inquadra il codice QR della tessera del cliente con lo scanner (oppure digita il numero
        tessera) e inserisci l&apos;importo dell&apos;acquisto in euro. Controlla il nome che compare
        prima di accreditare.
      </p>

      <ActionForm action={addPointsByCard} className="space-y-5">
        <div>
          <label htmlFor="card" className={labelCls}>
            Numero tessera
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brown-800/40" />
            <input
              id="card"
              name="card"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="TAC-2026-000000"
              className={`${inputCls} pl-9 font-mono`}
              required
            />
          </div>

          {/* The confirmation step: who is about to be credited. */}
          <div aria-live="polite" className="mt-2 min-h-[2.5rem]">
            {holder.state === "checking" && (
              <p className="text-xs text-brown-800/60">Verifica tessera…</p>
            )}
            {holder.state === "error" && (
              <p className="text-sm font-semibold text-danger">{holder.message}</p>
            )}
            {holder.state === "found" && (
              <div className="rounded-xl bg-gold/10 px-4 py-2.5">
                <p className="text-sm font-semibold text-brown-950">{holder.name}</p>
                <p className="text-xs text-brown-800/70">
                  Saldo attuale {holder.points} punti · tessera {holder.cardNumber}
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="euros" className={labelCls}>
            Importo acquisto (€)
          </label>
          <input
            id="euros"
            name="euros"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={euros}
            onChange={(e) => setEuros(e.target.value)}
            placeholder="0,00"
            className={inputCls}
            required
          />
        </div>

        {ready && (
          <p className="rounded-xl bg-ok-soft px-4 py-2.5 text-sm text-ok-soft-fg">
            Stai per accreditare <strong>+{points} punti</strong> a{" "}
            <strong>{holder.state === "found" ? holder.name : ""}</strong> (nuovo saldo{" "}
            {holder.state === "found" ? holder.points + points : 0}).
          </p>
        )}

        <PendingButton tone="gold" disabled={!ready}>
          Accredita punti
        </PendingButton>
        {!ready && (
          <p className="text-xs text-brown-800/60">
            Inserisci una tessera valida e un importo che generi almeno un punto.
          </p>
        )}
      </ActionForm>
    </Panel>
  );
}
