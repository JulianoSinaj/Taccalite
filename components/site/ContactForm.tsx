"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

const TOPICS = ["Informazioni", "Catering", "Consegna a domicilio", "Richiesta speciale"];

const fieldClass =
  "w-full border-b border-rule bg-transparent py-3 text-[0.9375rem] text-brown-950 placeholder:text-tan transition-colors focus:border-gold-deep focus:outline-none";

const labelClass =
  "block text-[0.625rem] font-semibold tracking-[0.22em] text-taupe uppercase";

export default function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/contatti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Non è stato possibile inviare il messaggio.");
        setState("idle");
        return;
      }
      form.reset();
      setState("sent");
    } catch {
      setError("Connessione non riuscita. Riprova, o chiamaci in bottega.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="border border-gold/40 bg-paper-warm p-6 sm:p-8">
        <Check className="size-6 text-gold-deep" aria-hidden />
        <p className="font-display mt-4 text-2xl font-semibold text-brown-950">
          Messaggio ricevuto.
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-brown-700">
          Vi rispondiamo al più presto. Se avete fretta, il telefono è sempre la via
          più veloce.
        </p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="mt-5 py-2 text-[0.6875rem] font-semibold tracking-[0.18em] text-brown-950 uppercase underline-offset-4 hover:underline"
        >
          Scrivi un altro messaggio
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 sm:gap-7">
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-7">
        <div>
          <label className={labelClass} htmlFor="contact-name">
            Nome e cognome
          </label>
          <input
            id="contact-name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            placeholder="Mario Rossi"
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="contact-email">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="mario@esempio.it"
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="contact-phone">
            Telefono <span className="normal-case">(facoltativo)</span>
          </label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            maxLength={30}
            autoComplete="tel"
            placeholder="333 1234567"
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="contact-topic">
            Motivo
          </label>
          <select id="contact-topic" name="topic" defaultValue={TOPICS[0]} className={fieldClass}>
            {TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="contact-message">
          Messaggio
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder="Raccontateci di cosa avete bisogno: quante persone, per quando, eventuali allergie…"
          className={`${fieldClass} resize-y`}
        />
      </div>

      {/* Honeypot — off-screen rather than display:none, which some bots skip. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-company">Azienda</label>
        <input id="contact-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p role="alert" className="text-[0.875rem] text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
        <button
          type="submit"
          disabled={state === "sending"}
          className="group/send relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-brown-950 px-8 py-4 text-[0.9375rem] font-semibold text-cream transition-opacity disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none sm:py-3.5"
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-gold [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-[850ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/send:[clip-path:circle(150%_at_50%_120%)]"
          />
          <span className="relative z-10 inline-flex items-center gap-2.5 transition-colors duration-500 group-hover/send:text-brown-950">
            {state === "sending" && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {state === "sending" ? "Invio…" : "Invia il messaggio"}
          </span>
        </button>
        <p className="text-center text-[0.8125rem] text-taupe sm:text-left">
          Rispondiamo in giornata negli orari di bottega.
        </p>
      </div>
    </form>
  );
}
