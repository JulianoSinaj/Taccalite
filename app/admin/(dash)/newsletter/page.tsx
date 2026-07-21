import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, inputCls, labelCls, fmtDate, SearchBox, Pagination } from "@/components/admin/ui";
import { ActionForm, PendingButton, DeleteForm } from "@/components/admin/ActionForm";
import { getSubscribersPage } from "@/lib/admin/queries";
import { removeSubscriber, sendBroadcast, sendTestBroadcast } from "@/lib/admin/actions";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ page?: string; stato?: string; origine?: string; q?: string }> };

const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "confirmed", label: "Confermati" },
  { value: "pending", label: "In attesa" },
  { value: "unsubscribed", label: "Disiscritti" },
];

const chipCls = (active: boolean) =>
  `rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
    active ? "bg-gold text-brown-950" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
  }`;

// Client-side live preview + test-form mirror. Kept as an inline script so the
// server page stays self-contained: it renders the composed plaintext body into
// #nl-preview (paragraph per blank line, <br> per newline) and copies the
// composed subject/body into the hidden "Invia prova" form fields.
const composerScript = `
(function () {
  var subject = document.getElementById('nl-subject');
  var body = document.getElementById('nl-body');
  var preview = document.getElementById('nl-preview');
  var tSubject = document.getElementById('nl-test-subject');
  var tBody = document.getElementById('nl-test-body');
  if (!subject || !body) return;
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function render() {
    if (preview) {
      var text = body.value.trim();
      preview.innerHTML = text
        ? text.split(/\\n{2,}/).map(function (p) {
            return '<p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 14px;">' +
              esc(p).replace(/\\n/g, '<br>') + '</p>';
          }).join('')
        : '<p style="color:#8a7b6c;font-size:13px;">L\\'anteprima comparirà qui.</p>';
    }
    if (tSubject) tSubject.value = subject.value;
    if (tBody) tBody.value = body.value;
  }
  subject.addEventListener('input', render);
  body.addEventListener('input', render);
  render();
})();
`;

export default async function AdminNewsletter({ searchParams }: SP) {
  const { page: pageStr, stato = "all", origine = "all", q } = await searchParams;
  const page = Number(pageStr) || 1;
  const [{ rows: subs, total, confirmed, pageCount, sources }, admin] = await Promise.all([
    getSubscribersPage({ page, status: stato, source: origine, q }),
    isAdmin(),
  ]);

  // Preserve the active filters/search on chip links (dropping page).
  const filterHref = (patch: Record<string, string>) => {
    const sp = new URLSearchParams();
    const base: Record<string, string> = { stato, origine, ...(q ? { q } : {}), ...patch };
    for (const [k, v] of Object.entries(base)) if (v && v !== "all") sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/admin/newsletter?${qs}` : "/admin/newsletter";
  };

  return (
    <div>
      <AdminHeader
        title="Newsletter"
        subtitle={`${confirmed} iscritti confermati · ${total} nel filtro attuale`}
        action={
          admin ? (
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- API download route, not a page
            <a
              href="/api/admin/export/subscribers"
              download
              className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Esporta CSV
            </a>
          ) : null
        }
      />

      <details className="mb-6">
        <summary className="cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase w-fit">
          ✉ Invia comunicazione
        </summary>
        <Panel className="mt-4">
          <ActionForm action={sendBroadcast} className="space-y-4">
            <div>
              <label className={labelCls}>Segmento destinatari</label>
              <select name="source" defaultValue="" className={inputCls}>
                <option value="">Tutti i confermati ({confirmed})</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-brown-800/60">
                Scegli un&apos;origine per inviare solo a quel segmento di iscritti confermati.
              </p>
            </div>
            <div>
              <label className={labelCls}>Oggetto</label>
              <input
                id="nl-subject"
                name="subject"
                required
                className={inputCls}
                placeholder="La porchetta del sabato è pronta!"
              />
            </div>
            <div>
              <label className={labelCls}>Messaggio</label>
              <textarea
                id="nl-body"
                name="body"
                rows={6}
                required
                className={inputCls}
                placeholder="Scrivi qui la tua comunicazione…"
              />
            </div>

            <details className="rounded-lg border border-brown-900/10 bg-cream/40 p-3">
              <summary className="cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
                Anteprima messaggio
              </summary>
              <div id="nl-preview" className="mt-3 rounded-lg bg-white p-4">
                <p className="text-[13px] text-brown-800/60">L&apos;anteprima comparirà qui.</p>
              </div>
            </details>

            <p className="text-xs text-brown-800/60">
              Inviata agli iscritti confermati del segmento scelto. Senza SMTP configurato, le email
              restano nel registro Email (test).
            </p>
            <PendingButton
              confirm={`Confermi l'invio della newsletter? Riceverà fino a ${confirmed} iscritti confermati (o solo il segmento selezionato).`}
            >
              Invia a {confirmed} iscritti
            </PendingButton>
          </ActionForm>

          {/* Separate form so the owner gets its own inline feedback; its subject
              and body are mirrored from the composer above by composerScript. */}
          <ActionForm action={sendTestBroadcast} className="mt-4 border-t border-brown-900/10 pt-4">
            <input type="hidden" id="nl-test-subject" name="subject" />
            <input type="hidden" id="nl-test-body" name="body" />
            <div className="flex flex-wrap items-center gap-3">
              <PendingButton tone="dark">Invia prova a me</PendingButton>
              <span className="text-xs text-brown-800/60">
                Ricevi un&apos;anteprima via email prima dell&apos;invio reale.
              </span>
            </div>
          </ActionForm>

          <script dangerouslySetInnerHTML={{ __html: composerScript }} />
        </Panel>
      </details>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <Link key={c.value} href={filterHref({ stato: c.value })} className={chipCls(stato === c.value)}>
            {c.label}
          </Link>
        ))}
      </div>

      {sources.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href={filterHref({ origine: "all" })} className={chipCls(origine === "all")}>
            Tutte le origini
          </Link>
          {sources.map((s) => (
            <Link key={s} href={filterHref({ origine: s })} className={chipCls(origine === s)}>
              {s}
            </Link>
          ))}
        </div>
      )}

      <SearchBox
        basePath="/admin/newsletter"
        q={q}
        placeholder="Cerca per email…"
        hidden={{ stato, origine }}
      />

      {subs.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {q || stato !== "all" || origine !== "all"
              ? "Nessun iscritto corrisponde ai filtri."
              : "Nessun iscritto ancora."}
          </p>
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

      <Pagination basePath="/admin/newsletter" page={page} pageCount={pageCount} params={{ stato, origine, q }} />
    </div>
  );
}
