"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

const inputClasses =
  "w-full border border-rule-strong bg-paper-warm/40 px-4 py-3.5 text-sm text-brown-950 transition-colors placeholder:text-taupe/60 focus:border-gold-dark focus:outline-none";

const buttonClasses =
  "mt-2 rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark disabled:pointer-events-none disabled:opacity-60";

/**
 * "Password dimenticata" — asks for an address and says the same thing either way.
 *
 * The success copy is deliberately non-committal ("se l'indirizzo è
 * registrato…"). The server holds the same line; if this form ever started
 * reporting "indirizzo non trovato" it would hand anyone a way to test which of
 * the shop's customers have accounts.
 */
export function RequestResetForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fd.get("email") }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-gold">
          <Check className="size-7 text-on-gold" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-brown-950">Controlla la posta</h2>
        <p className="mt-4 text-brown-700">
          Se l&apos;indirizzo è registrato, ti abbiamo inviato un link per scegliere una nuova
          password. Vale un&apos;ora sola e può essere usato una volta.
        </p>
        <p className="mt-3 text-sm text-taupe">
          Non arriva nulla? Controlla lo spam, oppure{" "}
          <button type="button" onClick={() => setSent(false)} className="underline hover:text-brown-950">
            riprova con un altro indirizzo
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <p className="text-brown-700">
        Inserisci l&apos;indirizzo email del tuo account: ti manderemo un link per scegliere una
        nuova password.
      </p>
      <div className="space-y-2">
        <label className="eyebrow eyebrow-dark block" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          placeholder="mario.rossi@email.it"
          className={inputClasses}
        />
      </div>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={busy} data-magnetic className={buttonClasses}>
        {busy ? "Invio…" : "Inviami il link"}
      </button>
      <p className="text-center text-sm text-taupe">
        <Link href="/account" className="underline hover:text-brown-950">
          Torna all&apos;accesso
        </Link>
      </p>
    </form>
  );
}

/**
 * The other half: redeem the link and set the password.
 *
 * `state` comes from the server, which has already inspected the token without
 * spending it — so an expired or already-used link says so instead of failing
 * only after the visitor has typed a new password twice.
 */
export function ResetPasswordForm({
  token,
  state,
}: {
  token: string;
  state: "valid" | "used" | "expired" | "unknown";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state !== "valid") {
    const message =
      state === "used"
        ? "Questo link è già stato usato. Se ti serve ancora, richiedine uno nuovo."
        : state === "expired"
          ? "Questo link è scaduto. Richiedine uno nuovo: vale un'ora."
          : "Questo link non è valido. Controlla di averlo copiato per intero.";
    return (
      <div className="text-center">
        <h2 className="font-display text-2xl font-semibold text-brown-950">Link non utilizzabile</h2>
        <p className="mt-4 text-brown-700">{message}</p>
        <Link
          href="/password/recupera"
          className="mt-8 inline-flex rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-brown-900"
        >
          Richiedi un nuovo link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    if (password !== String(fd.get("confirm") ?? "")) {
      setError("Le due password non coincidono.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-gold">
          <Check className="size-7 text-on-gold" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-brown-950">Password aggiornata</h2>
        <p className="mt-4 text-brown-700">
          Per sicurezza abbiamo chiuso tutte le sessioni aperte. Accedi con la nuova password.
        </p>
        <button
          type="button"
          onClick={() => router.push("/account")}
          className="mt-8 inline-flex rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 transition-colors hover:bg-gold-dark"
        >
          Vai all&apos;accesso
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <p className="text-brown-700">Scegli una nuova password per il tuo account.</p>
      <div className="space-y-2">
        <label className="eyebrow eyebrow-dark block" htmlFor="password">
          Nuova password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Almeno 8 caratteri"
          className={inputClasses}
        />
      </div>
      <div className="space-y-2">
        <label className="eyebrow eyebrow-dark block" htmlFor="confirm">
          Ripeti la password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          className={inputClasses}
        />
      </div>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={busy} data-magnetic className={buttonClasses}>
        {busy ? "Salvataggio…" : "Salva la nuova password"}
      </button>
    </form>
  );
}
