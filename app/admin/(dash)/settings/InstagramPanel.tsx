import { Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getInstagramStatus } from "@/lib/instagram";
import { siteConfig } from "@/lib/site";
import {
  connectInstagram,
  disconnectInstagram,
  refreshInstagramFeedNow,
  refreshInstagramTokenNow,
} from "@/lib/admin/instagram-actions";

function fmt(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Admin → Impostazioni → Instagram. Server component: reads status, renders the
 * connect form + maintenance actions. Token is write-only (never echoed back).
 */
export async function InstagramPanel() {
  const status = await getInstagramStatus();
  const daysLeft = status.tokenDaysLeft;
  const expiryTone =
    daysLeft == null ? "text-brown-800/70" : daysLeft <= 7 ? "font-semibold text-red-700" : "text-brown-800/70";

  return (
    <Panel>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-lg text-brown-950">Instagram (feed in homepage)</h2>
          <p className="mt-2 text-sm text-brown-800/70">
            Stato:{" "}
            <span className={status.configured ? "font-semibold text-ok" : "font-semibold text-warn"}>
              {status.configured
                ? `collegato${status.cache?.username ? ` come @${status.cache.username}` : ""}${
                    status.source === "env" ? " (token da variabile d'ambiente)" : ""
                  }`
                : "non collegato — la homepage mostra solo il banner «Seguici»"}
            </span>
          </p>
        </div>
        <a
          href={siteConfig.social.instagram}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold tracking-widest text-gold-deep uppercase hover:underline"
        >
          @{siteConfig.social.instagramHandle} ↗
        </a>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-xs text-brown-800/70 sm:grid-cols-2">
        <div className="flex justify-between gap-4 border-t border-brown-900/10 pt-2">
          <dt>Ultimo aggiornamento feed</dt>
          <dd className="text-right">
            {status.cache ? `${fmt(status.cache.fetchedAt)} · ${status.cache.posts} post` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-brown-900/10 pt-2">
          <dt>Token rinnovato il</dt>
          <dd className="text-right">{fmt(status.tokenRefreshedAt)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-brown-900/10 pt-2">
          <dt>Scadenza token</dt>
          <dd className={`text-right ${expiryTone}`}>
            {status.tokenExpiresAt ? `${fmt(status.tokenExpiresAt)} (${daysLeft} gg)` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-brown-900/10 pt-2">
          <dt>Ultimo errore</dt>
          <dd className={`text-right ${status.lastError ? "text-red-700" : ""}`}>
            {status.lastError ? `${status.lastError.message} · ${fmt(status.lastError.at)}` : "nessuno"}
          </dd>
        </div>
      </dl>

      <ActionForm action={connectInstagram} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className={labelCls} htmlFor="instagram-token">
            {status.source === "settings" ? "Sostituisci token di accesso" : "Token di accesso (long-lived)"}
          </label>
          <input
            id="instagram-token"
            name="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder="IGAAR…"
            className={inputCls}
          />
        </div>
        <PendingButton tone="dark">Collega</PendingButton>
      </ActionForm>
      <p className="mt-2 text-xs text-brown-800/70">
        Genera un token <em>long-lived</em> (60 giorni) per l&apos;account professionale della bottega da{" "}
        <a
          href="https://developers.facebook.com/apps/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Meta for Developers
        </a>{" "}
        → app → <em>Instagram</em> → <em>API setup with Instagram login</em> → «Generate token». Il token viene
        verificato e salvato qui; il rinnovo automatico avviene ogni settimana tramite il cron (
        <code>job=instagram-refresh</code>). Il feed viene aggiornato ogni 30 minuti; le ultime foto restano
        visibili anche se Instagram è temporaneamente irraggiungibile.
      </p>

      {status.configured && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionForm action={refreshInstagramFeedNow} className="inline-flex items-center gap-2">
            <PendingButton tone="gold">Aggiorna feed ora</PendingButton>
          </ActionForm>
          <ActionForm action={refreshInstagramTokenNow} className="inline-flex items-center gap-2">
            <PendingButton tone="gold">Rinnova token</PendingButton>
          </ActionForm>
          {status.source === "settings" && (
            <ActionForm action={disconnectInstagram} className="inline-flex items-center gap-2">
              <PendingButton
                tone="danger"
                confirm="Rimuovere il token Instagram? La homepage tornerà a mostrare solo il banner «Seguici»."
              >
                Scollega
              </PendingButton>
            </ActionForm>
          )}
        </div>
      )}
    </Panel>
  );
}
