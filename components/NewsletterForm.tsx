"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";

export default function NewsletterForm() {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("busy");
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fd.get("email"), company: fd.get("company") }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      setStatus("done");
      setMessage(json.message ?? "Controlla la tua email per confermare.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Errore imprevisto");
    }
  }

  if (status === "done") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-gold">
        <Check className="size-4 shrink-0" />
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex border-b border-white/10 pb-4 transition-colors focus-within:border-gold">
        <input
          type="email"
          name="email"
          required
          placeholder="Inserisci la tua email"
          aria-label="Email per la newsletter"
          className="w-full bg-transparent text-sm text-cream placeholder:text-white/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "busy"}
          aria-label="Iscriviti alla newsletter"
          className="text-gold transition-transform hover:translate-x-1 disabled:opacity-50"
        >
          <ArrowRight className="size-5" />
        </button>
      </div>
      {/* Honeypot */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0"
      />
      {status === "error" && message && <p className="mt-3 text-xs text-red-400">{message}</p>}
    </form>
  );
}
