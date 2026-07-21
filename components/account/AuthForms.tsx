"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Reveal from "@/components/Reveal";

const inputClasses =
  "w-full rounded-xl border border-brown-900/15 bg-cream-dark/40 px-4 py-3.5 text-sm text-brown-950 transition-colors placeholder:text-taupe/60 focus:border-gold-dark focus:outline-none";

export default function AuthForms() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload =
      mode === "login"
        ? { username: fd.get("username"), password: fd.get("password") }
        : {
            name: fd.get("name"),
            username: fd.get("username"),
            email: fd.get("email"),
            password: fd.get("password"),
            phone: fd.get("phone"),
            marketingConsent: fd.get("marketingConsent") === "on",
          };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden bg-brown-900 px-5 pt-40 pb-32 sm:px-8 sm:pt-48">
      <div className="parallax-orb absolute -top-40 -left-40 h-[60rem] w-[60rem] opacity-10" />
      <Reveal className="relative z-10 mx-auto max-w-xl">
        <div className="mb-12 space-y-4 text-center">
          <span className="eyebrow block">Il tuo account</span>
          <h1 className="font-display text-4xl tracking-tighter text-white sm:text-6xl">
            Il Club Taccalite
          </h1>
          <p className="text-lg font-light text-cream/75">
            Accedi per consultare la tua scheda fedeltà, i punti raccolti e i premi riservati ai
            clienti della bottega.
          </p>
        </div>

        <div className="card-shadow-soft space-y-6 rounded-[28px] bg-white/95 p-8 backdrop-blur sm:p-12">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "login" ? "bg-brown-950 text-cream" : "text-brown-800/75 hover:text-brown-950"
              }`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "register" ? "bg-brown-950 text-cream" : "text-brown-800/75 hover:text-brown-950"
              }`}
            >
              Registrati
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5">
            {mode === "register" && (
              <div className="space-y-2">
                <label className="eyebrow eyebrow-dark block" htmlFor="name">
                  Nome e cognome
                </label>
                <input id="name" name="name" required placeholder="Mario Rossi" className={inputClasses} />
              </div>
            )}
            <div className="space-y-2">
              <label className="eyebrow eyebrow-dark block" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                autoCapitalize="none"
                autoComplete="username"
                minLength={mode === "register" ? 3 : undefined}
                placeholder="mario.rossi"
                className={inputClasses}
              />
            </div>
            <div className="space-y-2">
              <label className="eyebrow eyebrow-dark block" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 8 : undefined}
                placeholder={mode === "register" ? "Almeno 8 caratteri" : "••••••••"}
                className={inputClasses}
              />
            </div>
            {mode === "register" && (
              <>
                <div className="space-y-2">
                  <label className="eyebrow eyebrow-dark block" htmlFor="email">
                    Email (opzionale)
                  </label>
                  <input id="email" name="email" type="email" placeholder="mario.rossi@email.it" className={inputClasses} />
                </div>
                <div className="space-y-2">
                  <label className="eyebrow eyebrow-dark block" htmlFor="phone">
                    Telefono (opzionale)
                  </label>
                  <input id="phone" name="phone" type="tel" placeholder="333 123 4567" className={inputClasses} />
                </div>
                <label className="flex items-start gap-3 text-sm text-brown-900/80">
                  <input type="checkbox" name="marketingConsent" className="mt-1 h-4 w-4 rounded accent-brown-950" />
                  Desidero ricevere novità e inviti alle degustazioni via email.
                </label>
              </>
            )}

            {error && <p className="text-sm font-medium text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              data-magnetic
              className="mt-2 rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark disabled:pointer-events-none disabled:opacity-60"
            >
              {busy ? "Attendere…" : mode === "login" ? "Accedi" : "Crea account"}
            </button>
          </form>
        </div>
      </Reveal>
    </div>
  );
}
