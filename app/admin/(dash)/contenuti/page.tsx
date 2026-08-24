import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { saveSiteContent } from "@/lib/admin/content-actions";
import { isAdmin } from "@/lib/auth/session";
import {
  SITE_CONTENT,
  CONTENT_GROUPS,
  getStoredContent,
  type ContentDef,
} from "@/lib/site-content";

export const dynamic = "force-dynamic";

/**
 * The words on the public pages.
 *
 * Everything here used to be a constant in a `.tsx` file, so correcting a typo
 * on the history page or a clause in the privacy policy meant a deploy — while
 * two settings (`home.today`, `home.brands`) were already editable, which is
 * what showed the pattern was intended and then stopped.
 *
 * Grouped by the page it appears on, because that is how somebody arrives here:
 * they have just looked at a page and want to change a line on it.
 */

const PREVIEW: Record<string, string> = {
  Home: "/",
  "La nostra storia": "/la-nostra-storia",
  Porchetta: "/porchetta",
};

const ROWS: Record<ContentDef["type"], number> = { text: 1, lines: 4, records: 6, rich: 18 };

function Editor({ def, stored }: { def: ContentDef; stored?: string }) {
  const value = stored ?? def.default;
  const edited = stored != null && stored !== def.default;

  return (
    <ActionForm action={saveSiteContent} className="space-y-2">
      <input type="hidden" name="key" value={def.key} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className={labelCls} htmlFor={`c-${def.key}`}>
          {def.label}
        </label>
        <span className="text-[11px] font-bold tracking-widest text-brown-800/50 uppercase">
          {edited ? "Modificato" : "Testo originale"}
        </span>
      </div>

      {def.type === "text" ? (
        <input id={`c-${def.key}`} name="value" defaultValue={value} className={inputCls} />
      ) : (
        <textarea
          id={`c-${def.key}`}
          name="value"
          rows={ROWS[def.type]}
          defaultValue={value}
          spellCheck
          className={`${inputCls} font-mono text-[14px] leading-relaxed`}
        />
      )}

      {def.fields && (
        <p className="text-xs text-brown-800/60">
          Campi, nell&apos;ordine: <code>{def.fields.join(" | ")}</code>
        </p>
      )}
      {def.help && <p className="text-xs text-brown-800/60">{def.help}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <PendingButton tone="dark">Salva</PendingButton>
        {/* Not a second button: emptying the box *is* the reset, because a row
            equal to the default is deleted rather than stored. Saying so beats
            an extra control that would do the same thing differently. */}
        <span className="text-xs text-brown-800/60">
          Svuota il campo e salva per tornare al testo originale.
        </span>
      </div>
    </ActionForm>
  );
}

export default async function AdminContenuti() {
  // The public voice of the business, and one of these is a legal document.
  if (!(await isAdmin())) redirect("/admin");

  const stored = await getStoredContent(SITE_CONTENT.map((d) => d.key));
  const editedCount = SITE_CONTENT.filter(
    (d) => stored.has(d.key) && stored.get(d.key) !== d.default,
  ).length;

  return (
    <div>
      <AdminHeader
        title="Contenuti del sito"
        subtitle={
          editedCount === 0
            ? "Tutti i testi sono quelli originali"
            : `${editedCount} ${editedCount === 1 ? "testo modificato" : "testi modificati"}`
        }
      />

      <Panel className="mb-6">
        <p className="text-sm text-brown-800/70">
          Qui si cambiano le parole delle pagine pubbliche senza passare da uno sviluppatore.
          Ogni testo parte da quello che il sito mostra oggi: finché non lo tocchi, non è
          memorizzato nulla e la pagina resta identica. Prodotti, news e schede dei negozi hanno
          le loro sezioni; orari, contatti e prezzi stanno in{" "}
          <Link href="/admin/settings" className="underline">
            Impostazioni
          </Link>
          .
        </p>
      </Panel>

      <div className="space-y-8">
        {CONTENT_GROUPS.map((group) => (
          <section key={group}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-2">
              <h2 className="font-display text-xl text-brown-950">{group}</h2>
              {PREVIEW[group] && (
                <Link
                  href={PREVIEW[group]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-bold tracking-widest text-gold-dark uppercase hover:underline"
                >
                  Vedi la pagina ↗
                </Link>
              )}
            </div>
            <div className="space-y-4">
              {SITE_CONTENT.filter((d) => d.group === group).map((def) => (
                <Panel key={def.key}>
                  <Editor def={def} stored={stored.get(def.key)} />
                </Panel>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
