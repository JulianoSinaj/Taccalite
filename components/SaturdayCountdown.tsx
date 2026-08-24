"use client";

import { useEffect, useState } from "react";

/** Next Saturday 08:00 local time (this Saturday if the oven is still ahead). */
function nextBatch(now: Date): Date {
  const target = new Date(now);
  const day = now.getDay(); // 0 Sun … 6 Sat
  let daysAhead = (6 - day + 7) % 7;
  if (daysAhead === 0 && now.getHours() >= 13) daysAhead = 7; // Saturday afternoon → next week
  target.setDate(now.getDate() + daysAhead);
  target.setHours(8, 0, 0, 0);
  return target;
}

type Parts = { days: number; hours: number; minutes: number; live: boolean };

function partsUntil(now: Date): Parts {
  const target = nextBatch(now);
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, live: true };
  const minutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
    live: false,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-4xl font-bold text-gold tabular-nums sm:text-6xl">
        {String(value).padStart(2, "0")}
      </p>
      {/* The trailing letter-space of the tracking would drag the centred label
          half a step left of its number; the negative margin gives it back.
          Looser tracking on a phone would also push "Minuti" wider than its own
          column and force the three units apart, so it tightens there. */}
      <p className="-mr-[0.2em] mt-1 text-[11px] font-bold tracking-[0.2em] text-cream/65 uppercase sm:-mr-[0.3em] sm:tracking-[0.3em]">
        {label}
      </p>
    </div>
  );
}

/**
 * Live countdown to the next Saturday-morning porchetta batch.
 * Renders a quiet placeholder until mounted to avoid hydration mismatch.
 */
export default function SaturdayCountdown() {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    const tick = () => setParts(partsUntil(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!parts) {
    return (
      <p className="font-display text-center text-4xl font-bold text-gold sm:text-6xl" aria-hidden>
        — : — : —
      </p>
    );
  }

  if (parts.live) {
    return (
      <div className="text-center">
        <p className="font-display text-3xl font-bold text-gold sm:text-5xl">È in forno adesso.</p>
        <p className="mt-2 text-sm font-light text-cream/80">
          Sabato mattina, Piazza Kennedy: la porchetta è calda fino a esaurimento.
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center gap-8 sm:gap-12" role="timer" aria-label="Tempo alla prossima porchetta">
      <Unit value={parts.days} label="Giorni" />
      <Unit value={parts.hours} label="Ore" />
      <Unit value={parts.minutes} label="Minuti" />
    </div>
  );
}
