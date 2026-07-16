import type { ReactNode } from "react";

export function AdminHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-brown-950 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-brown-800/70">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-brown-900/10 bg-white p-6 shadow-sm ${className}`}>{children}</div>
  );
}

const badgeStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-brown-900/10 text-brown-800",
  cancelled: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  refunded: "bg-red-100 text-red-700",
  unpaid: "bg-amber-100 text-amber-800",
  queued: "bg-amber-100 text-amber-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  confirmedSub: "bg-emerald-100 text-emerald-800",
  unsubscribed: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${
        badgeStyles[status] ?? "bg-brown-900/10 text-brown-800"
      }`}
    >
      {status}
    </span>
  );
}

export const inputCls =
  "w-full rounded-lg border border-brown-900/15 bg-cream/40 px-3 py-2.5 text-sm text-brown-950 focus:border-gold-dark focus:outline-none";

export const labelCls = "mb-1.5 block text-[11px] font-bold tracking-widest text-brown-800/70 uppercase";

export function SubmitButton({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "dark" | "danger" }) {
  const tones = {
    gold: "bg-gold text-brown-950 hover:bg-gold-dark",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type="submit"
      className={`rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function euro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `€ ${(cents / 100).toFixed(2)}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
