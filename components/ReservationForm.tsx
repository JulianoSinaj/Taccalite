"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Calendar, Check, Clock, Minus, Plus } from "lucide-react";
import { shops } from "@/lib/data";

type Status = "idle" | "submitting" | "success" | "error";

const PREFERENCES = ["Tavolo tranquillo", "Celebrazione speciale", "Degustazione guidata"];

const inputClasses =
  "w-full rounded-xl border border-brown-900/15 bg-cream-dark/40 px-4 py-3.5 text-sm text-brown-950 transition-colors placeholder:text-taupe focus:border-gold-dark focus:outline-none";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="eyebrow eyebrow-dark block" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function ReservationForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const preferences = formData.getAll("preferences").join(", ");
    const data: Record<string, unknown> = Object.fromEntries(formData.entries());
    delete data.preferences;
    data.guests = guests;
    if (preferences) {
      data.notes = [preferences, data.notes].filter(Boolean).join(" — ");
    }

    try {
      const res = await fetch("/api/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setStatus("success");
      form.reset();
      setGuests(2);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    }
  }

  if (status === "success") {
    return (
      <div className="cinematic-shadow rounded-[28px] border border-brown-900/10 bg-gradient-to-b from-white/70 to-white/40 p-10 text-center backdrop-blur-md sm:p-12">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold">
          <Check className="size-8 text-brown-950" />
        </div>
        <h3 className="font-display text-3xl font-semibold text-brown-950">
          Prenotazione inviata!
        </h3>
        <p className="mt-3 text-lg text-brown-900/75">
          Grazie per la tua richiesta. Ti contatteremo al più presto per confermare la
          disponibilità.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-8 rounded-full border border-brown-900/20 px-8 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
        >
          Invia un&apos;altra richiesta
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="cinematic-shadow space-y-10 rounded-[28px] border border-brown-900/10 bg-gradient-to-b from-white/70 to-white/40 p-8 backdrop-blur-md sm:p-12"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Nome completo" htmlFor="name">
          <input id="name" name="name" required placeholder="Mario Rossi" className={inputClasses} />
        </Field>
        <Field label="Telefono" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="333 123 4567"
            className={inputClasses}
          />
        </Field>
      </div>

      <Field label="Email (opzionale)" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          placeholder="mario.rossi@email.it"
          className={inputClasses}
        />
      </Field>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Data" htmlFor="date">
          <div className="relative">
            <Calendar className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-taupe" />
            <input id="date" name="date" type="date" required className={`${inputClasses} pl-12`} />
          </div>
        </Field>
        <Field label="Ora" htmlFor="time">
          <div className="relative">
            <Clock className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-taupe" />
            <input id="time" name="time" type="time" required className={`${inputClasses} pl-12`} />
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Numero di ospiti" htmlFor="guests">
          <div className="flex w-full items-center gap-4 rounded-full border border-brown-900/10 bg-cream-dark/50 p-2 md:w-48">
            <button
              type="button"
              aria-label="Riduci il numero di ospiti"
              onClick={() => setGuests((g) => Math.max(1, g - 1))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brown-950 text-cream transition-transform hover:scale-105"
            >
              <Minus className="size-4" />
            </button>
            <input
              id="guests"
              name="guests"
              type="number"
              value={guests}
              readOnly
              className="w-full bg-transparent text-center font-bold text-brown-950 focus:outline-none"
            />
            <button
              type="button"
              aria-label="Aumenta il numero di ospiti"
              onClick={() => setGuests((g) => Math.min(20, g + 1))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brown-950 text-cream transition-transform hover:scale-105"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </Field>
        <Field label="Negozio" htmlFor="shop">
          <select id="shop" name="shop" required className={inputClasses}>
            {shops.map((shop) => (
              <option key={shop.slug} value={shop.slug}>
                {shop.name} — {shop.specialty}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-4">
        <span className="eyebrow eyebrow-dark block">Preferenze speciali</span>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PREFERENCES.map((pref) => (
            <label key={pref} className="group flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="preferences"
                value={pref}
                className="h-5 w-5 rounded accent-brown-950"
              />
              <span className="text-sm text-brown-900 transition-colors group-hover:text-gold-dark">
                {pref}
              </span>
            </label>
          ))}
        </div>
      </div>

      <Field label="Note aggiuntive (opzionale)" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          placeholder="Allergie, preferenze alimentari, occasioni speciali…"
          className={`${inputClasses} min-h-[120px] resize-y`}
        />
      </Field>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        data-magnetic
        className="w-full rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-1 hover:bg-gold-dark hover:shadow-[0_20px_30px_-10px_rgba(225,190,100,0.4)] disabled:pointer-events-none disabled:opacity-60"
      >
        {status === "submitting" ? "Invio in corso…" : "Conferma prenotazione"}
      </button>
    </form>
  );
}
