"use client";

import { useState } from "react";
import { inputCls, labelCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { saveCampaign, sendCampaignNow, sendCampaignTest } from "@/lib/admin/campaign-actions";
import type { NewsletterCampaignRow } from "@/lib/db/schema";

/**
 * `datetime-local` value for an existing schedule, as the Ancona wall clock.
 *
 * The instant is stored in UTC; the operator reads and writes the shop's time,
 * whatever zone their own browser is in, and the server parses it back the same
 * way (`instantInRome`). Using the browser's zone here would have shown a
 * campaign scheduled for 09:00 as 08:00 to someone on a laptop set to London.
 */
function romeDateTimeValue(d: Date | null): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Same rendering as `campaignBodyHtml` on the server, for the live preview. */
function bodyHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 14px;">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/** A segment as the composer needs it: named, described, and sized right now. */
export type SegmentOption = { id: string; name: string; description: string; rule: string; size: number };

/**
 * Compose a newsletter as a saved campaign.
 *
 * The message is saved as a record before it can be sent — so it can be
 * drafted, scheduled, tested and reviewed afterwards. Targeting is either every
 * confirmed subscriber or a named segment; the old "one signup source" shortcut
 * is gone from the picker (a one-field segment does the same thing, and it made
 * the audit line and the confirm dialog disagree about who was being written to).
 */
export function CampaignComposer({
  campaign,
  segments = [],
  confirmedCount,
  templateHtml,
}: {
  campaign?: NewsletterCampaignRow | null;
  /** Reusable named segments. */
  segments?: SegmentOption[];
  confirmedCount: number;
  /** The real email template, with `{{SUBJECT}}` / `{{BODY}}` placeholders. */
  templateHtml: string;
}) {
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  const [schedule, setSchedule] = useState(romeDateTimeValue(campaign?.scheduledFor ?? null));
  const [segmentId, setSegmentId] = useState(campaign?.segmentId ?? "");
  const selectedSegment = segments.find((s) => s.id === segmentId);

  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const saved = !!campaign;
  const dirty =
    saved &&
    (subject !== campaign.subject ||
      body !== campaign.body ||
      segmentId !== (campaign.segmentId ?? "") ||
      schedule !== romeDateTimeValue(campaign.scheduledFor ?? null));

  // What "Invia adesso" will actually address: the saved record, not the form.
  const savedSegment = campaign?.segmentId ? segments.find((s) => s.id === campaign.segmentId) : undefined;
  const savedAudience = campaign?.segmentId
    ? savedSegment
      ? `al segmento «${savedSegment.name}» (${savedSegment.size} iscritti)`
      : "a un segmento che non esiste più — salva prima un destinatario"
    : campaign?.segment
      ? `agli iscritti con origine «${campaign.segment}»`
      : `a tutti i ${confirmedCount} iscritti confermati`;
  const audienceMissing = !!campaign?.segmentId && !savedSegment;

  const previewDoc = templateHtml
    .replace("{{SUBJECT}}", subject.trim() ? escapeHtml(subject) : "Oggetto")
    .replace("{{BODY}}", body.trim() ? bodyHtml(body) : "<p style=\"color:#807868;\">L'anteprima comparirà qui.</p>");

  return (
    <div className="space-y-4">
      <ActionForm action={saveCampaign} className="space-y-4">
        {campaign && <input type="hidden" name="id" value={campaign.id} />}

        <div>
          <label className={labelCls} htmlFor="campaign-segment">
            Destinatari
          </label>
          <select
            id="campaign-segment"
            name="segmentId"
            value={segmentId}
            onChange={(e) => setSegmentId(e.target.value)}
            className={inputCls}
          >
            <option value="">Tutti i confermati ({confirmedCount})</option>
            {segments.length > 0 && (
              <optgroup label="Segmenti">
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.size})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {/* Campaigns from before named segments carry a signup source; keep
              it unless the operator picks a segment, so re-saving an old draft
              doesn't quietly widen it to everyone. */}
          <input type="hidden" name="segment" value={segmentId ? "" : (campaign?.segment ?? "")} />
          <p className="mt-1 text-xs text-brown-800/70">
            {selectedSegment
              ? `${selectedSegment.description || selectedSegment.rule} · ${selectedSegment.size} iscritti in questo momento`
              : !segmentId && campaign?.segment
                ? `Questa campagna scrive agli iscritti con origine «${campaign.segment}». Scegli un segmento per cambiare destinatari.`
                : segments.length > 0
                ? "I segmenti si ricalcolano al momento dell'invio."
                : "Crea un segmento più in basso per scrivere solo a una parte degli iscritti."}
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
            maxLength={20000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Scrivi qui la tua comunicazione…"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-brown-800/70">
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
          <p className="mt-1 text-xs text-brown-800/70">
            Ora italiana. La campagna parte da sola al primo passaggio delle automazioni dopo
            quell&apos;ora (di norma la mattina seguente): per un invio immediato lascia vuoto,
            salva e usa «Invia adesso».
          </p>
        </div>

        <details className="rounded-lg border border-brown-900/10 bg-cream/40 p-3">
          <summary className="cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
            Anteprima email
          </summary>
          {/* The real template — header, footer and unsubscribe line — not a
              stand-in: what the operator approves is what arrives. */}
          <iframe
            title="Anteprima email"
            sandbox=""
            srcDoc={previewDoc}
            // theme-exempt: this is the mail client's ground, not the
            // gestionale's. Following the admin's dark theme here would preview
            // the message on a surface no recipient will ever see it on.
            className="mt-3 h-[32rem] w-full rounded-lg border border-brown-900/10 bg-white"
          />
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <PendingButton tone="dark">
            {schedule ? "Salva e programma" : saved ? "Salva bozza" : "Crea bozza"}
          </PendingButton>
          {dirty && (
            <span className="text-xs font-semibold text-warn-soft-fg">
              Modifiche non salvate: «Invia» e «Prova» usano l&apos;ultima versione salvata.
            </span>
          )}
        </div>
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
              disabled={audienceMissing}
              confirm={`Inviare "${campaign.subject}" adesso ${savedAudience}?`}
            >
              {campaign.status === "failed" ? "Riprova l'invio" : "Invia adesso"}
            </PendingButton>
          </ActionForm>

          <span className="text-xs text-brown-800/70">Destinatari: {savedAudience}.</span>
        </div>
      )}

      {!saved && (
        <p className="text-xs text-brown-800/70">
          {ready
            ? "Salva la bozza per poterla provare, inviare o programmare."
            : "Compila oggetto e messaggio per continuare."}
        </p>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
