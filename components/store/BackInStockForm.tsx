"use client";

import { useState, type FormEvent } from "react";

/**
 * "Notify me when available" form shown on a sold-out product page. Posts to
 * /api/stock-notify; the API always reports success (no email-enumeration leak).
 */
export default function BackInStockForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("busy");
    try {
      const res = await fetch("/api/stock-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email: email.trim() }),
      });
      const json = await res.json();
      setState(res.ok && json.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
        Fatto! Ti avviseremo via email appena il prodotto sarà di nuovo disponibile.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4">
      <p className="mb-2 text-sm font-semibold text-brown-950">Avvisami quando è disponibile</p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="La tua email"
          className="w-full rounded-xl border border-brown-900/15 bg-cream-dark/40 px-4 py-3 text-sm text-brown-950 focus:border-gold-dark focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "busy"}
          className="shrink-0 rounded-xl bg-brown-950 px-5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900 disabled:opacity-50"
        >
          {state === "busy" ? "…" : "Avvisami"}
        </button>
      </div>
      {state === "error" && <p className="mt-2 text-xs font-medium text-red-700">Qualcosa è andato storto. Riprova.</p>}
    </form>
  );
}
