import Link from "next/link";
import { AdminHeader, Panel, StatusBadge } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getUpcomingReservations, adminGetShops } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";
import { markPorchettaReady } from "@/lib/admin/actions";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  table: "Tavolo",
  porchetta: "Porchetta",
  order: "Ordine",
};

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

type Row = Awaited<ReturnType<typeof getUpcomingReservations>>[number];

export default async function ReservationAgenda() {
  const [rows, shops, capacityKg] = await Promise.all([
    getUpcomingReservations(),
    adminGetShops(),
    getSetting<number>("porchetta.weeklyCapacityKg", 0),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  // Rows arrive ordered by date then time — collapse into consecutive day groups.
  const groups: { date: string; items: Row[] }[] = [];
  for (const r of rows) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== r.date) {
      g = { date: r.date, items: [] };
      groups.push(g);
    }
    g.items.push(r);
  }

  return (
    <div>
      <AdminHeader
        title="Agenda & preparazione"
        subtitle={`${rows.length} prenotazioni in arrivo`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/reservations"
              className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15 print:hidden"
            >
              Elenco
            </Link>
            <PrintButton />
          </div>
        }
      />

      {groups.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna prenotazione in arrivo.</p>
        </Panel>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const porchetta = g.items.filter((r) => r.type === "porchetta");
            const totalKg = porchetta.reduce((sum, r) => sum + (r.quantityKg ?? 0), 0);
            const overCapacity = capacityKg > 0 && totalKg > capacityKg;
            return (
              <section key={g.date} className="break-inside-avoid">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-2">
                  <h2 className="font-display text-xl text-brown-950 capitalize">{formatDay(g.date)}</h2>
                  <div className="flex items-center gap-3 text-xs font-bold tracking-widest text-brown-800/60 uppercase">
                    <span>{g.items.length} prenotazioni</span>
                    {totalKg > 0 && (
                      <span
                        className={`rounded-full px-3 py-1 ${
                          overCapacity ? "bg-red-600/15 text-red-700" : "bg-gold/30 text-brown-950"
                        }`}
                      >
                        Porchetta: {totalKg}
                        {capacityKg > 0 ? ` / ${capacityKg}` : ""} kg · {porchetta.length} ordini
                        {overCapacity ? " · oltre capacità" : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {g.items.map((r) => (
                    <Panel key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="rounded-full bg-brown-900/10 px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase">
                          {TYPE_LABEL[r.type] ?? r.type}
                        </span>
                        <span className="font-semibold text-brown-950">{r.name}</span>
                        <span className="text-sm text-brown-800/70">{r.phone}</span>
                        {r.time && <span className="text-sm text-brown-800/70">· {r.time}</span>}
                        {r.guests != null && <span className="text-sm text-brown-800/70">· {r.guests} p.</span>}
                        {r.quantityKg != null && (
                          <span className="text-sm font-semibold text-brown-950">· {r.quantityKg} kg</span>
                        )}
                        <span className="text-sm text-brown-800/60">· {shopName.get(r.shopSlug) ?? r.shopSlug}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.type === "porchetta" &&
                          (r.readyAt ? (
                            <span className="rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-bold text-emerald-700">
                              Inviata ✓
                            </span>
                          ) : (
                            <ActionForm action={markPorchettaReady} className="print:hidden">
                              <input type="hidden" name="id" value={r.id} />
                              <PendingButton tone="gold">Segna pronta</PendingButton>
                            </ActionForm>
                          ))}
                        <StatusBadge status={r.status} />
                      </div>
                    </Panel>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
