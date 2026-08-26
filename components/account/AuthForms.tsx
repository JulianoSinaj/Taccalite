"use client";

import { useState, type FormEvent } from "react";
import { PrivacyNote } from "@/components/site/PrivacyNote";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Reveal from "@/components/Reveal";

const inputClasses =
  "w-full  border border-rule-strong bg-paper-warm/40 px-4 py-3.5 text-sm text-brown-950 transition-colors placeholder:text-taupe/60 focus:border-gold-dark focus:outline-none";

export default function AuthForms() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Revealed only after the server says this account has a second factor. It
  // has to exist here at all because `/api/auth/login` can return
  // `twoFactorRequired` for any account — the storefront form used to have no
  // code field, so a customer with 2FA could authenticate everywhere except the
  // page built for them.
  const [twoFactor, setTwoFactor] = useState(false);

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setTwoFactor(false);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload =
      mode === "login"
        ? {
            identifier: fd.get("identifier"),
            password: fd.get("password"),
            code: fd.get("code") || undefined,
          }
        : {
            name: fd.get("name"),
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
      if (!res.ok || !json.ok) {
        if (json.twoFactorRequired) {
          setTwoFactor(true);
          setError(fd.get("code") ? (json.error ?? "Codice non valido.") : null);
          setBusy(false);
          return;
        }
        throw new Error(json.error ?? "Errore imprevisto");
      }
      // Tells the header's account badge — mounted once in the layout, not
      // reached by this page's `router.refresh()` — to re-check who's signed in.
      window.dispatchEvent(new Event("taccalite:auth-changed"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pt-28 pb-20 sm:px-8 sm:pt-40 sm:pb-28">
      <Reveal className="mx-auto max-w-xl">
        <div className="mb-8 space-y-4 text-center sm:mb-12 sm:space-y-5">
          <p className="inline-flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Il tuo account
            <span aria-hidden className="h-px w-10 bg-gold" />
          </p>
          <h1 className="font-display display-lg font-semibold text-brown-950">
            Il Club <span className="wonk text-gold-deep">Taccalite</span>
          </h1>
          <p className="mx-auto max-w-lg text-lg leading-relaxed text-brown-700">
            Accedi per consultare la tua scheda fedeltà, i punti raccolti e i premi riservati ai
            clienti della bottega.
          </p>
        </div>

        <div className="card-shadow-soft space-y-6 border border-rule bg-paper p-5 sm:p-8 lg:p-12">
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => switchMode("login")}
              aria-pressed={mode === "login"}
              className={`rounded-full px-5 py-3 text-sm font-semibold transition-colors sm:py-2 ${
                mode === "login" ? "bg-brown-950 text-cream" : "border border-rule text-taupe hover:text-brown-950 sm:border-0"
              }`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              aria-pressed={mode === "register"}
              className={`rounded-full px-5 py-3 text-sm font-semibold transition-colors sm:py-2 ${
                mode === "register" ? "bg-brown-950 text-cream" : "border border-rule text-taupe hover:text-brown-950 sm:border-0"
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

            {mode === "login" ? (
              <div key="login" className="space-y-2">
                <label className="eyebrow eyebrow-dark block" htmlFor="identifier">
                  Email
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="mario.rossi@email.it"
                  className={inputClasses}
                />
                {/* Accounts created before the email-first switch still have a
                    handle, and their owners will type it here. `loginUser`
                    accepts either, so say so rather than rejecting them. */}
                <p className="text-xs text-taupe">
                  Hai un vecchio account? Puoi ancora entrare con il tuo username.
                </p>
              </div>
            ) : (
              <div key="register" className="space-y-2">
                <label className="eyebrow eyebrow-dark block" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="mario.rossi@email.it"
                  className={inputClasses}
                />
                <p className="text-xs text-taupe">
                  Serve a ritrovare i tuoi ordini e a rientrare se dimentichi la password.
                </p>
              </div>
            )}

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
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                placeholder={mode === "register" ? "Almeno 8 caratteri" : "••••••••"}
                className={inputClasses}
              />
              {mode === "login" && (
                <p className="pt-1 text-right text-sm">
                  <Link href="/password/recupera" className="text-taupe underline hover:text-brown-950">
                    Password dimenticata?
                  </Link>
                </p>
              )}
            </div>

            {mode === "login" && twoFactor && (
              <div className="space-y-2">
                <label className="eyebrow eyebrow-dark block" htmlFor="code">
                  Codice di verifica (2FA)
                </label>
                <input
                  id="code"
                  name="code"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoFocus
                  maxLength={20}
                  placeholder="123456"
                  className={inputClasses}
                />
                <p className="text-xs text-taupe">
                  Il codice a 6 cifre dalla tua app di autenticazione, oppure uno dei codici di
                  recupero se non hai il telefono.
                </p>
              </div>
            )}

            {mode === "register" && (
              <>
                <div className="space-y-2">
                  <label className="eyebrow eyebrow-dark block" htmlFor="phone">
                    Telefono (opzionale)
                  </label>
                  <input id="phone" name="phone" type="tel" placeholder="333 123 4567" className={inputClasses} />
                </div>
                <label className="flex items-start gap-3 py-1.5 text-sm text-brown-700">
                  <input type="checkbox" name="marketingConsent" className="mt-0.5 size-5 shrink-0 rounded accent-brown-950" />
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
            {mode === "register" && <PrivacyNote action="creando un account" className="mt-1" />}
          </form>
        </div>
      </Reveal>
    </div>
  );
}
