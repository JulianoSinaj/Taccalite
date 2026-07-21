"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Calendar, Check, Clock, Flame, Minus, Plus, Users, UtensilsCrossed } from "lucide-react";

type ShopOption = {
  slug: string;
  name: string;
  specialty: string;
  address?: string;
  porchettaEnabled?: boolean;
  reservationsEnabled?: boolean;
};
type ResType = "table" | "porchetta" | "order";
type Status = "idle" | "submitting" | "success" | "error";

const PREFERENCES = ["Tavolo tranquillo", "Celebrazione speciale", "Degustazione guidata"];

// Slot ogni 30 minuti entro l'orario di apertura (9:00 – 20:00)
const timeSlots = Array.from({ length: 23 }, (_, i) => {
  const h = 9 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

/** Next Saturday as yyyy-mm-dd, for the porchetta pickup default. */
function nextSaturdayIso(): string {
  const d = new Date();
  const day = d.getDay();
  const ahead = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + ahead);
  return d.toISOString().slice(0, 10);
}

const inputClasses =
  "w-full rounded-xl border border-brown-900/15 bg-cream-dark/40 px-4 py-3.5 text-sm text-brown-950 transition-colors placeholder:text-taupe focus:border-gold-dark focus:outline-none";

const TYPES: { key: ResType; label: string; icon: typeof UtensilsCrossed; hint: string }[] = [
  { key: "table", label: "Tavolo", icon: UtensilsCrossed, hint: "Degustazione al banco" },
  { key: "porchetta", label: "Porchetta", icon: Flame, hint: "Del sabato, su prenotazione" },
  { key: "order", label: "Ordine speciale", icon: Users, hint: "Taglieri, catering, richieste" },
];

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="eyebrow eyebrow-dark block" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function ReservationForm({ shops }: { shops: ShopOption[] }) {
  // A shop is available for table/order reservations unless explicitly disabled;
  // porchetta pickup is offered only at shops that make porchetta.
  const reservationShops = shops.filter((s) => s.reservationsEnabled !== false);
  const porchettaShops = shops.filter((s) => s.porchettaEnabled !== false);

  const [type, setType] = useState<ResType>("table");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [quantity, setQuantity] = useState(1);
  const [porchettaShop, setPorchettaShop] = useState(porchettaShops[0]?.slug ?? "");

  const porchettaPickup = porchettaShops.find((s) => s.slug === porchettaShop) ?? porchettaShops[0];
  // Only offer reservation types that at least one location supports.
  const availableTypes = TYPES.filter((t) =>
    t.key === "porchetta" ? porchettaShops.length > 0 : reservationShops.length > 0,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = event.currentTarget;
    const fd = new FormData(form);
    const preferences = fd.getAll("preferences").join(", ");
    const notesParts = [preferences, (fd.get("notes") as string) || ""].filter(Boolean);

    const payload = {
      type,
      name: (fd.get("name") as string)?.trim(),
      phone: (fd.get("phone") as string)?.trim(),
      email: (fd.get("email") as string)?.trim() || "",
      shop: fd.get("shop") as string,
      date: (fd.get("date") as string) || "",
      time: type === "table" ? (fd.get("time") as string) || "" : "",
      guests: type === "table" ? guests : undefined,
      quantityKg: type === "porchetta" ? quantity : undefined,
      notes: notesParts.join(" — ") || "",
      company: (fd.get("company") as string) || "", // honeypot
    };

    try {
      const res = await fetch("/api/prenotazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setReference(json.reference ?? null);
      setStatus("success");
      form.reset();
      setGuests(2);
      setQuantity(1);
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
        <h3 className="font-display text-3xl font-semibold text-brown-950">Prenotazione inviata!</h3>
        <p className="mt-3 text-lg text-brown-900/75">
          Grazie per la tua richiesta. Ti contatteremo al più presto per confermare la disponibilità.
        </p>
        {reference && (
          <p className="mt-6 inline-block rounded-full border border-gold-dark/40 bg-gold/10 px-5 py-2 text-sm font-bold tracking-widest text-brown-950 uppercase">
            Riferimento: {reference}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setReference(null);
          }}
          className="mt-8 block w-full rounded-full border border-brown-900/20 px-8 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream sm:w-auto sm:mx-auto"
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
      {/* Type selector */}
      <div className="space-y-4">
        <span className="eyebrow eyebrow-dark block">Cosa vuoi prenotare</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {availableTypes.map((t) => {
            const Icon = t.icon;
            const active = type === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? "border-gold-dark bg-gold/15 shadow-sm"
                    : "border-brown-900/12 bg-cream-dark/30 hover:border-brown-900/25"
                }`}
              >
                <Icon className={`size-5 ${active ? "text-gold-deep" : "text-brown-800/70"}`} />
                <span className="text-sm font-bold text-brown-950">{t.label}</span>
                <span className="text-xs text-brown-800/70">{t.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Nome completo" htmlFor="name">
          <input id="name" name="name" required placeholder="Mario Rossi" className={inputClasses} />
        </Field>
        <Field label="Telefono" htmlFor="phone">
          <input id="phone" name="phone" type="tel" required placeholder="333 123 4567" className={inputClasses} />
        </Field>
      </div>

      <Field label="Email (consigliata, per la conferma)" htmlFor="email">
        <input id="email" name="email" type="email" placeholder="mario.rossi@email.it" className={inputClasses} />
      </Field>

      {/* Type-specific fields */}
      {type === "table" && (
        <>
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
                <select id="time" name="time" required defaultValue="" className={`${inputClasses} pl-12`}>
                  <option value="" disabled>
                    --:--
                  </option>
                  {timeSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field label="Numero di ospiti">
              <div className="flex w-full items-center gap-4 rounded-full border border-brown-900/10 bg-cream-dark/50 p-2 md:w-48">
                <button
                  type="button"
                  aria-label="Riduci il numero di ospiti"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brown-950 text-cream transition-transform hover:scale-105"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-full text-center font-bold text-brown-950" aria-live="polite">
                  {guests}
                </span>
                <button
                  type="button"
                  aria-label="Aumenta il numero di ospiti"
                  onClick={() => setGuests((g) => Math.min(30, g + 1))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brown-950 text-cream transition-transform hover:scale-105"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </Field>
            <Field label="Negozio" htmlFor="shop">
              <select id="shop" name="shop" required className={inputClasses}>
                {reservationShops.map((shop) => (
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
                  <input type="checkbox" name="preferences" value={pref} className="h-5 w-5 rounded accent-brown-950" />
                  <span className="text-sm text-brown-900 transition-colors group-hover:text-gold-dark">{pref}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {type === "porchetta" && (
        <>
          <div className="rounded-xl border border-gold-dark/30 bg-gold/10 px-5 py-4 text-sm text-brown-900">
            La porchetta esce calda dal forno il <strong>sabato mattina</strong>
            {porchettaPickup?.address ? (
              <>
                {" "}
                presso <strong>{porchettaPickup.name}</strong> ({porchettaPickup.address})
              </>
            ) : null}
            . Prenota entro il venerdì la quantità che desideri ritirare.
          </div>
          {porchettaShops.length > 1 && (
            <Field label="Negozio di ritiro" htmlFor="porchetta-shop">
              <select
                id="porchetta-shop"
                name="shop"
                required
                value={porchettaShop}
                onChange={(e) => setPorchettaShop(e.target.value)}
                className={inputClasses}
              >
                {porchettaShops.map((shop) => (
                  <option key={shop.slug} value={shop.slug}>
                    {shop.name} — {shop.specialty}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field label="Sabato di ritiro" htmlFor="date">
              <div className="relative">
                <Calendar className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-taupe" />
                <input
                  id="date"
                  name="date"
                  type="date"
                  required
                  defaultValue={nextSaturdayIso()}
                  className={`${inputClasses} pl-12`}
                />
              </div>
            </Field>
            <Field label="Quantità (kg)">
              <div className="flex w-full items-center gap-4 rounded-full border border-brown-900/10 bg-cream-dark/50 p-2 md:w-56">
                <button
                  type="button"
                  aria-label="Riduci la quantità"
                  onClick={() => setQuantity((q) => Math.max(0.5, Math.round((q - 0.5) * 2) / 2))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brown-950 text-cream transition-transform hover:scale-105"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-full text-center font-bold text-brown-950" aria-live="polite">
                  {quantity} kg
                </span>
                <button
                  type="button"
                  aria-label="Aumenta la quantità"
                  onClick={() => setQuantity((q) => Math.min(50, Math.round((q + 0.5) * 2) / 2))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brown-950 text-cream transition-transform hover:scale-105"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </Field>
          </div>
          {porchettaShops.length <= 1 && (
            <input type="hidden" name="shop" value={porchettaShop} />
          )}
        </>
      )}

      {type === "order" && (
        <Field label="Negozio" htmlFor="shop">
          <select id="shop" name="shop" required className={inputClasses}>
            {reservationShops.map((shop) => (
              <option key={shop.slug} value={shop.slug}>
                {shop.name} — {shop.specialty}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        label={type === "order" ? "Cosa desideri ordinare" : "Note aggiuntive (opzionale)"}
        htmlFor="notes"
      >
        <textarea
          id="notes"
          name="notes"
          rows={4}
          required={type === "order"}
          placeholder={
            type === "order"
              ? "Descrivi il tuo ordine: tagliere per 6, catering, richieste particolari…"
              : "Allergie, preferenze alimentari, occasioni speciali…"
          }
          className={`${inputClasses} min-h-[120px] resize-y`}
        />
      </Field>

      {/* Honeypot (hidden from users) */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Azienda</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

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
