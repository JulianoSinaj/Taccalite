"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputClasses =
  "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm text-cream transition-colors placeholder:text-cream/40 focus:border-gold focus:outline-none";

export default function AdminLoginForm({ wrongRole }: { wrongRole: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    wrongRole ? "Questo account non ha accesso all'area riservata." : null,
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-8">
      <div className="space-y-2">
        <label className="eyebrow block" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required placeholder="admin@taccalite.local" className={inputClasses} />
      </div>
      <div className="space-y-2">
        <label className="eyebrow block" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" required placeholder="••••••••" className={inputClasses} />
      </div>

      {error && <p className="text-sm font-medium text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase transition-all hover:bg-gold-dark disabled:opacity-60"
      >
        {busy ? "Accesso…" : "Accedi"}
      </button>

      {wrongRole && (
        <button
          type="button"
          onClick={logout}
          className="w-full text-center text-xs font-semibold text-cream/60 underline hover:text-cream"
        >
          Esci da questo account
        </button>
      )}
    </form>
  );
}
