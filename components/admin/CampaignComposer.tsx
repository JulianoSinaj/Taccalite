"use client";

import { useState } from "react";
import { inputCls, labelCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { saveCampaign, sendCampaignNow, sendCampaignTest } from "@/lib/admin/campaign-actions";
import type { NewsletterCampaignRow } from "@/lib/db/schema";

/** `datetime-local` value for an existing schedule, in the browser's own zone. */
function localDateTimeValue(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/**
 * Compose a newsletter as a saved campaign.
 *
 * Replaces the previous inline `dangerouslySetInnerHTML` script: the live
 * preview is just rendered React over the same paragraph rules the server uses,
 * and the message is saved as a record before it can be sent — so it can be
 * drafted, scheduled, tested and reviewed afterwards.
 */
/** A segment as the composer needs it: named, described, and sized right now. */
export type SegmentOption = { id: string; name: string; description: string; rule: string; size: number };

export function CampaignComposer({
  campaign,
  sources,
  segments = [],
  confirmedCount,
}: {
  campaign?: NewsletterCampaignRow | null;
  /** Distinct subscriber sources, for the legacy origin targeting. */
  sources: string[];
  /** Reusable named segments. */
  segments?: SegmentOption[];
  confirmedCount: number;
}) {
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  const [schedule, setSchedule] = useState(localDateTimeValue(campaign?.scheduledFor ?? null));
  const [target, setTarget] = useState(
    campaign?.segmentId ? `seg:${campaign.segmentId}` : campaign?.segment ? `src:${campaign.segment}` : "",
  );
  const selectedSegment = target.startsWith("seg:")
    ? segments.find((s) => s.id === target.slice(4))
    : undefined;

  const paragraphs = body.trim() ? body.trim().split(/\n{2,}/) : [];
  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const saved = !!campaign;

  return (
    <div className="space-y-4">
      <ActionForm action={saveCampaign} className="space-y-4">
        {campaign && <input type="hidden" name="id" value={campaign.id} />}

        {/* One control for both targeting styles: a named segment (a rule,
            re-evaluated at send time) or the older "one signup source". */}
        <div>
          <label className={labelCls} htmlFor="campaign-segment">
            Destinatari
          </label>
          <select
            id="campaign-segment"
            name="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={inputCls}
          >
            <option value="">Tutti i confermati ({confirmedCount})</option>
            {segments.length > 0 && (
              <optgroup label="Segmenti">
                {segments.map((s) => (
                  <option key={s.id} value={`seg:${s.id}`}>
                    {s.name} ({s.size})
                  </option>
                ))}
              </optgroup>
            )}
            {sources.length > 0 && (
              <optgroup label="Origine iscrizione">
                {sources.map((s) => (
                  <option key={s} value={`src:${s}`}>
                    {s}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {/* Split into the two fields the action expects. */}
          <input type="hidden" name="segmentId" value={target.startsWith("seg:") ? target.slice(4) : ""} />
          <input type="hidden" name="segment" value={target.startsWith("src:") ? target.slice(4) : ""} />
          <p className="mt-1 text-xs text-brown-800/60">
            {selectedSegment
              ? `${selectedSegment.description || selectedSegment.rule} · ${selectedSegment.size} iscritti in questo momento`
              : "I segmenti si ricalcolano al momento dell'invio."}
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="campaign-subject">
            Oggetto
          </label>
          <input
            id="campaign-subject"
            name="subject"
            required
            maxLength={300}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="La porchetta del sabato è pronta!"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="campaign-body">
            Messaggio
          </label>
          <textarea
            id="campaign-body"
            name="body"
            rows={8}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Scrivi qui la tua comunicazione…"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-brown-800/60">
            Riga vuota = nuovo paragrafo. Niente HTML: il testo viene formattato automaticamente.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="campaign-schedule">
            Programma l&apos;invio (facoltativo)
          </label>
          <input
            id="campaign-schedule"
            name="scheduledFor"
            type="datetime-local"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={`${inputCls} max-w-xs`}
          />
          <p className="mt-1 text-xs text-brown-800/60">
            Con una data la campagna parte da sola alla prima esecuzione utile delle automazioni.
            Lascia vuoto per tenerla come bozza e inviarla a mano.
          </p>
        </div>

        <details className="rounded-lg border border-brown-900/10 bg-cream/40 p-3">
          <summary className="cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
            Anteprima messaggio
          </summary>
          <div className="mt-3 rounded-lg bg-surface p-4">
            {paragraphs.length === 0 ? (
              <p className="text-[14px] text-brown-800/60">L&apos;anteprima comparirà qui.</p>
            ) : (
              paragraphs.map((p, i) => (
                <p key={i} className="mb-3.5 text-[16px] leading-relaxed text-brown-900 last:mb-0">
                  {p.split("\n").map((line, j, all) => (
                    <span key={j}>
                      {line}
                      {j < all.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              ))
            )}
          </div>
        </details>

        <PendingButton tone="dark">
          {schedule ? "Salva e programma" : saved ? "Salva bozza" : "Crea bozza"}
        </PendingButton>
      </ActionForm>

      {/* Sending acts on the saved record, so a campaign is always on file before
          it can reach anyone. */}
      {saved && campaign.status !== "sent" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-brown-900/10 pt-4">
          <ActionForm action={sendCampaignTest}>
            <input type="hidden" name="id" value={campaign.id} />
            <PendingButton tone="dark">Invia prova a me</PendingButton>
          </ActionForm>

          <ActionForm action={sendCampaignNow}>
            <input type="hidden" name="id" value={campaign.id} />
            <PendingButton
              confirm={`Inviare "${campaign.subject}" adesso${
                campaign.segment ? ` al segmento ${campaign.segment}` : ` a tutti i ${confirmedCount} iscritti confermati`
              }?`}
            >
              Invia adesso
            </PendingButton>
          </ActionForm>

          <span className="text-xs text-brown-800/60">
            Le modifiche non salvate non vengono inviate: salva prima la bozza.
          </span>
        </div>
      )}

      {!saved && (
        <p className="text-xs text-brown-800/60">
          {ready
            ? "Salva la bozza per poterla inviare o programmare."
            : "Compila oggetto e messaggio per continuare."}
        </p>
      )}
    </div>
  );
}
