"use client";

import { useState, type FormEvent } from "react";
import { shops } from "@/lib/data";

type Status = "idle" | "submitting" | "success" | "error";

export default function ReservationForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

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
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-brown-700/15 bg-white/60 p-8 text-center">
        <h3 className="font-display text-2xl font-semibold text-brown-900">Richiesta inviata!</h3>
        <p className="mt-2 text-brown-800/70">
          Grazie per la tua prenotazione. Ti contatteremo al più presto per confermare.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-5 rounded-full border border-brown-800 px-5 py-2 text-sm font-semibold text-brown-900 hover:bg-brown-900 hover:text-cream"
        >
          Invia un&apos;altra richiesta
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-2xl border border-brown-700/15 bg-white/60 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome e cognome" name="name" required />
        <Field label="Telefono" name="phone" type="tel" required />
      </div>
      <Field label="Email" name="email" type="email" />
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Data" name="date" type="date" required />
        <Field label="Ora" name="time" type="time" required />
        <Field label="Numero persone" name="guests" type="number" min={1} defaultValue={2} required />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="shop">
          Negozio
        </label>
        <select
          id="shop"
          name="shop"
          required
          className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
        >
          {shops.map((shop) => (
            <option key={shop.slug} value={shop.slug}>
              {shop.name} — {shop.specialty}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor="notes">
          Note (opzionale)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
        />
      </div>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-brown-900 px-6 py-3 text-sm font-semibold text-cream hover:bg-brown-800 disabled:opacity-60"
      >
        {status === "submitting" ? "Invio in corso…" : "Invia richiesta di prenotazione"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  min,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: number;
  defaultValue?: string | number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-brown-900" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        min={min}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-brown-700/25 bg-cream px-3 py-2.5 text-sm text-brown-900 focus:border-brown-800 focus:outline-none"
      />
    </div>
  );
}
