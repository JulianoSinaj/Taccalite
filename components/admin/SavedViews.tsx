"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, X } from "lucide-react";
import { inputCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { saveView, deleteView } from "@/lib/admin/view-actions";
import type { SavedViewRow } from "@/lib/db/schema";

/**
 * The saved filter presets for one admin list.
 *
 * `currentQuery` is the page's active filters, resolved server-side and passed
 * in — reading `window.location` here would make the component depend on the
 * client's idea of the URL, which lags a server-rendered navigation.
 */
export function SavedViews({
  path,
  views,
  currentQuery,
}: {
  path: string;
  views: SavedViewRow[];
  currentQuery: string;
}) {
  const [naming, setNaming] = useState(false);
  const active = views.find((v) => v.query === currentQuery);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      {views.map((v) => (
        <span
          key={v.id}
          className={`inline-flex items-center gap-1 rounded-full pr-1 pl-3 text-xs font-bold tracking-widest uppercase ${
            active?.id === v.id ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800"
          }`}
        >
          <Link href={`${path}${v.query ? `?${v.query}` : ""}`} className="py-2 hover:underline">
            {v.name}
          </Link>
          {/* A saved view is not recoverable once deleted, and this sits a few
              pixels from the link that opens it — a 20px target beside a 44px
              one, which on a phone is a mis-tap that silently destroys the
              preset. `.tap` gives it the 44px it was missing without drawing the
              pill any taller, and the confirmation gives it a way back. */}
          <ConfirmingDelete id={v.id} name={v.name} />
        </span>
      ))}

      {naming ? (
        <ActionForm action={saveView} className="inline-flex items-center gap-1">
          <input type="hidden" name="path" value={path} />
          <input type="hidden" name="query" value={currentQuery} />
          <label className="sr-only" htmlFor="view-name">
            Nome della vista
          </label>
          <input
            id="view-name"
            name="name"
            autoFocus
            required
            maxLength={60}
            // Prefilled with the active view's name, so re-saving tweaked
            // filters onto it is one click; type a different name to fork it.
            defaultValue={active?.name ?? ""}
            placeholder="es. Da evadere oggi"
            className={`${inputCls} w-44 py-1.5`}
          />
          <PendingButton tone="dark">Salva</PendingButton>
          <button
            type="button"
            onClick={() => setNaming(false)}
            className="rounded-full px-2 py-1.5 text-xs text-brown-800/70 hover:text-brown-950"
          >
            Annulla
          </button>
        </ActionForm>
      ) : (
        // Offered even while a saved view is active: `saveView` updates a view
        // re-saved under the same name, so this is also how you re-point an
        // existing view at tweaked filters — and hiding it meant a view could
        // never be corrected, only deleted and rebuilt.
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-brown-900/5 px-3 py-2 text-xs font-bold tracking-widest text-brown-800/70 uppercase hover:bg-brown-900/10 hover:text-brown-950"
        >
          <Bookmark className="size-3" />
          {active ? "Aggiorna o salva" : "Salva questa vista"}
        </button>
      )}
    </div>
  );
}

/** The × on a saved view: a full-size target, and a question before it goes. */
function ConfirmingDelete({ id, name }: { id: string; name: string }) {
  return (
    <ActionForm action={deleteView} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <PendingButton
        tone="ghost"
        confirm={`Eliminare la vista «${name}»? I filtri che salva non sono recuperabili.`}
        confirmLabel="Elimina"
        confirmTone="danger"
      >
        <X className="size-3" aria-hidden />
        <span className="sr-only">Elimina la vista {name}</span>
      </PendingButton>
    </ActionForm>
  );
}
