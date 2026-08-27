"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RichText from "@/components/site/RichText";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { inputCls, labelCls, fmtDateTime } from "@/components/admin/ui";
import { saveSiteContent } from "@/lib/admin/content-actions";
import {
  applyTokensWith,
  hasDraftMarkers,
  incompleteRecordLines,
  parseBlocks,
  parseLines,
  type ContentTokens,
} from "@/lib/site-content-parse";

/** The registry entry, minus anything the browser has no use for. */
export type EditorDef = {
  key: string;
  label: string;
  help?: string;
  page: string;
  type: "text" | "lines" | "rich" | "records";
  fields?: string[];
  default: string;
};

export type EditorMeta = { updatedAt: string | null; updatedBy: string | null };

const ROWS: Record<EditorDef["type"], number> = { text: 1, lines: 4, records: 6, rich: 18 };

const hint = "text-xs text-brown-800/60";
const smallBtn =
  "inline-flex min-h-11 items-center rounded-full border border-brown-900/15 px-4 text-xs font-bold tracking-widest text-brown-900 uppercase transition-colors hover:bg-brown-900/5";

const normalise = (s: string) => s.replace(/\r\n/g, "\n").trimEnd();

/**
 * One text, edited in place.
 *
 * The field is controlled so the page can know three things the server cannot:
 * whether the box differs from what is saved (the "non salvato" state and the
 * leave-page guard), what the parsed result looks like right now (the preview
 * and the row count), and what to put back when a reset succeeds — an
 * uncontrolled textarea would keep showing the emptied box after the server
 * had already restored the original.
 */
export function ContentEditor({
  def,
  stored,
  meta,
  tokens,
}: {
  def: EditorDef;
  /** What the database holds, or null when the page uses the built-in default. */
  stored: string | null;
  meta: EditorMeta | null;
  tokens: ContentTokens;
}) {
  const edited = stored != null && stored !== def.default;
  const saved = edited ? stored : def.default;
  const [text, setText] = useState(saved);
  const [showPreview, setShowPreview] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const dirty = normalise(text) !== normalise(saved);
  const isBlank = text.trim() === "";
  const draft = def.type === "rich" && hasDraftMarkers(text);

  // Leaving with an unsaved box loses it — fourteen forms on one page make that
  // easy to do by accident. One listener per dirty editor; the browser shows a
  // single prompt regardless.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const stats = useMemo(() => {
    if (def.type === "lines") return { count: parseLines(text).length, bad: [] as number[] };
    if (def.type === "records")
      return { count: parseLines(text).length, bad: incompleteRecordLines(text, def.fields ?? []) };
    if (def.type === "rich") return { count: parseBlocks(text).length, bad: [] as number[] };
    return null;
  }, [def.type, def.fields, text]);

  const id = `c-${def.key}`;
  const unit =
    def.type === "rich"
      ? stats?.count === 1
        ? "paragrafo"
        : "paragrafi"
      : stats?.count === 1
        ? "riga"
        : "righe";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label className={`${labelCls} mb-0`} htmlFor={id}>
          {def.label}
        </label>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold tracking-widest uppercase">
          {dirty ? (
            <span className="text-gold-dark">Non salvato</span>
          ) : edited ? (
            <span className="text-brown-800/60">Modificato</span>
          ) : (
            <span className="text-brown-800/40">Testo originale</span>
          )}
          {draft && <span className="text-danger">Bozza da verificare</span>}
          <Link href={def.page} target="_blank" rel="noopener noreferrer" className="text-gold-dark hover:underline">
            Vedi la pagina ↗
          </Link>
        </div>
      </div>

      <ActionForm
        action={saveSiteContent}
        className="space-y-3"
        onSuccess={() => {
          // The server deleted the row when the box was blank or equal to the
          // default; mirror that so the box shows what the page now shows.
          setText((t) => (t.trim() === "" ? def.default : normalise(t)));
        }}
      >
        <input type="hidden" name="key" value={def.key} />
        {def.type === "text" ? (
          <input id={id} name="value" value={text} onChange={(e) => setText(e.target.value)} className={inputCls} />
        ) : (
          <textarea
            id={id}
            name="value"
            rows={ROWS[def.type]}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck
            className={`${inputCls} leading-relaxed ${def.type === "rich" ? "text-[15px]" : "font-mono text-[14px]"}`}
          />
        )}

        {def.fields && (
          <p className={hint}>
            Campi, nell&apos;ordine: <code>{def.fields.join(" | ")}</code>
          </p>
        )}
        {def.help && <p className={hint}>{def.help}</p>}

        {stats && (
          <p className={hint} aria-live="polite">
            {stats.count} {unit}
            {stats.bad.length > 0 && (
              <>
                {" · "}
                <span className="font-bold text-danger">
                  {stats.bad.length === 1 ? "riga incompleta" : "righe incomplete"}: {stats.bad.join(", ")}
                </span>
                {" — sul sito i campi mancanti resteranno vuoti."}
              </>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <PendingButton tone="dark" disabled={!dirty}>
            {isBlank ? "Ripristina originale" : "Salva"}
          </PendingButton>
          {def.type === "rich" && (
            <button
              type="button"
              className={smallBtn}
              onClick={() => setShowPreview((v) => !v)}
              aria-expanded={showPreview}
            >
              {showPreview ? "Nascondi anteprima" : "Anteprima"}
            </button>
          )}
          {text !== def.default && (
            <button
              type="button"
              className={smallBtn}
              onClick={() => setShowOriginal((v) => !v)}
              aria-expanded={showOriginal}
            >
              {showOriginal ? "Nascondi originale" : "Mostra originale"}
            </button>
          )}
          {meta?.updatedAt && (
            <span className={`${hint} ml-auto`}>
              Ultima modifica {fmtDateTime(meta.updatedAt)}
              {meta.updatedBy ? ` · ${meta.updatedBy}` : ""}
            </span>
          )}
        </div>
      </ActionForm>

      {/* Reset is its own form: the same key with an empty value, which the
          action treats as "delete the row". Only offered when a row exists. */}
      {edited && (
        <ActionForm action={saveSiteContent} className="inline-flex" onSuccess={() => setText(def.default)}>
          <input type="hidden" name="key" value={def.key} />
          <input type="hidden" name="value" value="" />
          <PendingButton
            tone="danger"
            confirm={`«${def.label}» tornerà al testo originale del sito. La versione modificata andrà persa.`}
          >
            Ripristina originale
          </PendingButton>
        </ActionForm>
      )}

      {showOriginal && (
        <div className="rounded-lg border border-brown-900/10 bg-cream/60 p-3">
          <p className={labelCls}>Testo originale</p>
          <pre className="max-h-80 overflow-auto font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-brown-900">
            {def.default}
          </pre>
        </div>
      )}

      {showPreview && def.type === "rich" && (
        <div className="rounded-lg border border-brown-900/10 bg-cream/60 p-4">
          <p className={labelCls}>Anteprima — come lo vede chi visita il sito</p>
          <RichText blocks={parseBlocks(applyTokensWith(text, tokens))} />
        </div>
      )}
    </div>
  );
}
