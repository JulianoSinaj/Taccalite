import { AdminHeader, Panel, StatusBadge, inputCls, labelCls, fmtDate } from "@/components/admin/ui";
import { ActionForm, PendingButton, DeleteForm } from "@/components/admin/ActionForm";
import { getSubscribers } from "@/lib/admin/queries";
import { removeSubscriber, sendBroadcast } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminNewsletter() {
  const subs = await getSubscribers();
  const confirmed = subs.filter((s) => s.status === "confirmed").length;

  return (
    <div>
      <AdminHeader
        title="Newsletter"
        subtitle={`${confirmed} iscritti confermati · ${subs.length} totali`}
        action={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- API download route, not a page
          <a
            href="/api/admin/export/subscribers"
            download
            className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Esporta CSV
          </a>
        }
      />

      <details className="mb-6">
        <summary className="cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase w-fit">
          ✉ Invia comunicazione
        </summary>
        <Panel className="mt-4">
          <ActionForm action={sendBroadcast} className="space-y-4">
            <div>
              <label className={labelCls}>Oggetto</label>
              <input name="subject" required className={inputCls} placeholder="La porchetta del sabato è pronta!" />
            </div>
            <div>
              <label className={labelCls}>Messaggio</label>
              <textarea name="body" rows={6} required className={inputCls} placeholder="Scrivi qui la tua comunicazione…" />
            </div>
            <p className="text-xs text-brown-800/60">
              Inviata ai {confirmed} iscritti confermati. Senza SMTP configurato, le email restano
              nel registro Email (test).
            </p>
            <PendingButton>Invia a {confirmed} iscritti</PendingButton>
          </ActionForm>
        </Panel>
      </details>
      {subs.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun iscritto ancora.</p>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-brown-900/10 text-[10px] font-bold tracking-widest text-brown-800/60 uppercase">
                <th className="pb-3">Email</th>
                <th className="pb-3">Stato</th>
                <th className="pb-3">Origine</th>
                <th className="pb-3">Iscritto</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-b border-brown-900/5">
                  <td className="py-3 font-medium text-brown-950">{s.email}</td>
                  <td className="py-3">
                    <StatusBadge status={s.status === "confirmed" ? "confirmed" : s.status === "unsubscribed" ? "cancelled" : "pending"} />
                  </td>
                  <td className="py-3 text-brown-800/70">{s.source}</td>
                  <td className="py-3 text-brown-800/70">{fmtDate(s.createdAt)}</td>
                  <td className="py-3 text-right">
                    {s.status !== "unsubscribed" && (
                      <DeleteForm
                        action={removeSubscriber}
                        id={s.id}
                        confirm={`Rimuovere ${s.email} dalla newsletter?`}
                      >
                        Rimuovi
                      </DeleteForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
