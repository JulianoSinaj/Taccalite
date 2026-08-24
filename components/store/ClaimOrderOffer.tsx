"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

/**
 * The account offer on the order-confirmation page.
 *
 * This is the highest-intent moment the storefront has: the customer has just
 * paid, their details are already on file, and the points this order would have
 * earned are a concrete number rather than a marketing promise. Everything the
 * signup form would ask for is already known except a password.
 */
export default function ClaimOrderOffer({
  orderId,
  email,
  points,
  signedIn,
}: {
  orderId: string;
  email: string;
  points: number;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ points: number; registered: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState(false);

  async function submit(password?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/claim-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.existingAccount) setExistingAccount(true);
        throw new Error(json.error ?? "Errore imprevisto");
      }
      setDone({ points: json.points ?? 0, registered: json.mode === "registered" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 border border-gold-dark/40 bg-gold/15 px-5 py-5 text-left">
        <p className="flex items-center gap-2 font-semibold text-brown-950">
          <Check className="size-5 shrink-0 text-gold-deep" />
          {done.registered ? "Account creato" : "Ordine collegato"}
        </p>
        <p className="mt-2 text-sm text-brown-700">
          {done.points > 0
            ? `Ti abbiamo accreditato ${done.points} punti per questo ordine. `
            : "Questo ordine è ora nella tua area personale. "}
          {done.registered &&
            "Ti abbiamo inviato un'email per confermare l'indirizzo: da lì recuperi anche gli ordini fatti in precedenza."}
        </p>
        <Link
          href="/account"
          className="mt-4 inline-flex rounded-full bg-brown-950 px-6 py-3 text-sm font-semibold text-cream hover:bg-brown-900"
        >
          Vai all&apos;area personale
        </Link>
      </div>
    );
  }

  // Signed in already: nothing to create, one button to bind the order.
  if (signedIn) {
    return (
      <div className="mt-8 border border-rule bg-paper-warm px-5 py-5 text-left">
        <p className="font-semibold text-brown-950">Collega questo ordine al tuo account</p>
        <p className="mt-1 text-sm text-brown-700">
          L&apos;ordine è stato fatto come ospite. Collegalo per ritrovarlo fra i tuoi ordini
          {points > 0 ? ` e ricevere ${points} punti fedeltà` : ""}.
        </p>
        {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => submit()}
          className="mt-4 inline-flex rounded-full bg-gold px-6 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-gold-dark disabled:opacity-60"
        >
          {busy ? "Collegamento…" : "Collega l'ordine"}
        </button>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await submit(String(fd.get("password") ?? ""));
  }

  return (
    <div className="mt-8 border border-gold-dark/40 bg-gold/10 px-5 py-5 text-left">
      <p className="font-semibold text-brown-950">
        {points > 0
          ? `Tieni i ${points} punti di questo ordine`
          : "Crea il tuo account in un passaggio"}
      </p>
      <p className="mt-1 text-sm text-brown-700">
        Abbiamo già i tuoi dati: scegli solo una password e l&apos;ordine finisce nella tua area
        personale, con la scheda fedeltà del Club.
      </p>

      {existingAccount ? (
        <p className="mt-4 text-sm text-brown-700">
          <Link href="/account" className="font-semibold underline">
            Accedi con {email}
          </Link>{" "}
          e potrai collegare questo ordine da qui.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="eyebrow eyebrow-dark mb-1.5 block" htmlFor="claim-email">
              Email
            </label>
            {/* Shown, not editable: the account is being created for the address
                this order was placed with, and letting it be changed here would
                hand the order's token holder an account on any address. */}
            <input
              id="claim-email"
              type="email"
              value={email}
              readOnly
              className="w-full border border-rule bg-paper-warm/60 px-4 py-3 text-sm text-taupe"
            />
          </div>
          <div>
            <label className="eyebrow eyebrow-dark mb-1.5 block" htmlFor="claim-password">
              Scegli una password
            </label>
            <input
              id="claim-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Almeno 8 caratteri"
              className="w-full border border-rule-strong bg-paper px-4 py-3 text-sm text-brown-950 placeholder:text-taupe/60 focus:border-gold-dark focus:outline-none"
            />
          </div>
          {error && <p className="text-sm font-medium text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex rounded-full bg-gold px-6 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-gold-dark disabled:opacity-60"
          >
            {busy ? "Creazione…" : "Crea account"}
          </button>
        </form>
      )}
    </div>
  );
}
