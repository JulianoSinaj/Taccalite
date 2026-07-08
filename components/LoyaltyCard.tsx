const POINTS = 340;
const NEXT_REWARD = 500;

export default function LoyaltyCard({ name }: { name: string }) {
  const pct = Math.min(100, Math.round((POINTS / NEXT_REWARD) * 100));

  return (
    <div className="overflow-hidden rounded-2xl border border-brown-700/15 bg-gradient-to-br from-brown-900 to-brown-950 p-6 text-cream sm:p-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            Scheda Fedeltà
          </div>
          <div className="font-display mt-1 text-2xl font-semibold">Taccalite</div>
        </div>
        <span className="rounded-full border border-gold/40 px-3 py-1 text-xs font-medium text-gold">
          Cliente
        </span>
      </div>

      <div className="mt-8">
        <div className="text-sm text-cream/60">Titolare</div>
        <div className="font-display text-xl">{name}</div>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-cream/60">Punti raccolti</span>
          <span className="font-semibold text-gold">
            {POINTS} / {NEXT_REWARD}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-cream/10">
          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-cream/50">
          Ti mancano {NEXT_REWARD - POINTS} punti per il tuo prossimo premio.
        </p>
      </div>
    </div>
  );
}
