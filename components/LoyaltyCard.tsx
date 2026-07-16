import { Award, QrCode } from "lucide-react";

export default function LoyaltyCard({
  name,
  points,
  nextRewardPoints,
  cardNumber,
}: {
  name: string;
  points: number;
  nextRewardPoints?: number | null;
  cardNumber: string;
}) {
  const target = nextRewardPoints ?? points;
  const pct = target > 0 ? Math.min(100, Math.round((points / target) * 100)) : 100;

  return (
    <div className="cinematic-shadow relative mx-auto flex aspect-[1.6] w-full max-w-[520px] flex-col justify-between overflow-hidden rounded-[24px] border border-white/20 bg-gradient-to-br from-gold via-[#e8cc84] to-gold-dark p-6 sm:p-10">
      <div className="absolute inset-0 bg-white/5 opacity-10 mix-blend-overlay" />
      <div className="bg-noise absolute inset-0 opacity-30" />

      <div className="relative z-10 flex items-start justify-between">
        <span className="text-[10px] font-bold tracking-[0.4em] text-brown-950/70 uppercase">
          Scheda Fedeltà
        </span>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brown-950/5 sm:h-12 sm:w-12">
          <Award className="size-5 text-brown-950 sm:size-6" />
        </div>
      </div>

      <div className="relative z-10">
        <h3 className="font-display text-2xl font-bold tracking-tighter text-brown-950 uppercase sm:text-3xl">
          Taccalite
        </h3>
        <p className="text-[10px] font-bold tracking-[0.2em] text-brown-950/70 uppercase">
          Cliente · Norcineria dal 1946
        </p>
      </div>

      <div className="relative z-10 space-y-1">
        <p className="text-[10px] font-bold tracking-widest text-brown-950/75 uppercase">
          Punti accumulati
        </p>
        <p className="font-display text-4xl font-bold tracking-tight text-brown-950 sm:text-6xl">
          {points}{" "}
          {nextRewardPoints ? (
            <span className="text-xl font-light opacity-60 sm:text-2xl">/ {nextRewardPoints}</span>
          ) : null}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brown-950/10">
          <div className="h-full rounded-full bg-brown-950" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="relative z-10 flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-brown-950 uppercase">{name}</p>
          <p className="font-mono text-[10px] text-brown-950/65">#{cardNumber}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brown-950/20">
          <QrCode className="size-5 text-brown-950" />
        </div>
      </div>
    </div>
  );
}
