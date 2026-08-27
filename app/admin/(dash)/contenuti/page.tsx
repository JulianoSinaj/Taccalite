import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ContentEditor, type EditorDef } from "@/components/admin/ContentEditor";
import { isAdmin } from "@/lib/auth/session";
import {
  SITE_CONTENT,
  CONTENT_GROUPS,
  CONTENT_TOKENS,
  getStoredContent,
  getContentMeta,
  hasDraftMarkers,
} from "@/lib/site-content";

export const dynamic = "force-dynamic";

/**
 * The words on the public pages — "Testi del sito" in the navigation.
 *
 * Grouped by the page they appear on, because that is how somebody arrives
 * here: they have just looked at a page and want to change a line on it. The
 * editing itself lives in `ContentEditor`, a client component, because dirty
 * state, previews and the leave-page guard all need the text as it is typed.
 */

const anchor = (group: string) => group.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default async function AdminContenuti() {
  // The public voice of the business, and three of these are legal documents.
  if (!(await isAdmin())) redirect("/admin");

  const keys = SITE_CONTENT.map((d) => d.key);
  const [stored, meta] = await Promise.all([getStoredContent(keys), getContentMeta(keys)]);

  const current = (d: EditorDef) => stored.get(d.key) ?? d.default;
  const isEdited = (d: EditorDef) => stored.has(d.key) && stored.get(d.key) !== d.default;
  const editedCount = SITE_CONTENT.filter(isEdited).length;
  const drafts = SITE_CONTENT.filter((d) => d.type === "rich" && hasDraftMarkers(current(d)));

  return (
    <div>
      <AdminHeader
        title="Testi del sito"
        subtitle={
          editedCount === 0
            ? `${SITE_CONTENT.length} testi, tutti originali`
            : `${SITE_CONTENT.length} testi, ${editedCount} ${editedCount === 1 ? "modificato" : "modificati"}`
        }
      />

      <Panel className="mb-6 space-y-3">
        <p className="text-sm text-brown-800/70">
          Le parole delle pagine pubbliche, modificabili senza uno sviluppatore. Finché non tocchi
          un testo, la pagina mostra quello originale. Prodotti, news e negozi hanno le loro
          sezioni; orari, contatti e prezzi stanno in{" "}
          <Link href="/admin/settings" className="underline">
            Impostazioni
          </Link>
          .
        </p>
        <nav aria-label="Sezioni" className="flex flex-wrap gap-2">
          {CONTENT_GROUPS.map((group) => {
            const defs = SITE_CONTENT.filter((d) => d.group === group);
            const n = defs.filter(isEdited).length;
            return (
              <a
                key={group}
                href={`#${anchor(group)}`}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-brown-900/15 px-3 text-xs font-bold tracking-widest text-brown-900 uppercase hover:bg-brown-900/5"
              >
                {group}
                <span className={n ? "text-gold-dark" : "text-brown-800/40"}>
                  {n}/{defs.length}
                </span>
              </a>
            );
          })}
        </nav>
      </Panel>

      {drafts.length > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-brown-900"
        >
          <strong className="font-bold">Bozze legali ancora da verificare.</strong>{" "}
          {drafts.map((d) => d.label).join(", ")}{" "}
          {drafts.length === 1 ? "contiene" : "contengono"} clausole segnate «DA VERIFICARE» o la
          nota per il gestore, e sono già visibili sul sito così come sono. Falle rileggere a un
          legale o al commercialista, correggi il testo e rimuovi i segnaposto.
        </div>
      )}

      <div className="space-y-10">
        {CONTENT_GROUPS.map((group) => {
          const defs = SITE_CONTENT.filter((d) => d.group === group);
          const pages = [...new Set(defs.map((d) => d.page))];
          return (
            <section key={group} id={anchor(group)} className="scroll-mt-24">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-2">
                <h2 className="font-display text-xl text-brown-950">{group}</h2>
                <div className="flex flex-wrap gap-3 text-[12px] font-bold tracking-widest text-gold-dark uppercase">
                  {pages.map((p) => (
                    <Link
                      key={p}
                      href={p}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {pages.length === 1 ? "Vedi la pagina" : p} ↗
                    </Link>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {defs.map((def) => {
                  const m = meta.get(def.key);
                  return (
                    <Panel key={def.key}>
                      <ContentEditor
                        def={def}
                        stored={stored.get(def.key) ?? null}
                        meta={
                          m
                            ? { updatedAt: m.updatedAt?.toISOString() ?? null, updatedBy: m.updatedBy }
                            : null
                        }
                        tokens={CONTENT_TOKENS}
                      />
                    </Panel>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
