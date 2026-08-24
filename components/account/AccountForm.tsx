"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, TriangleAlert } from "lucide-react";
import { idleState, type ActionState } from "@/lib/admin/action-state";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export const accountInputCls =
  "w-full border border-rule-strong bg-paper-warm/40 px-4 py-3 text-sm text-brown-950 transition-colors placeholder:text-taupe/60 focus:border-gold-dark focus:outline-none";

export const accountLabelCls =
  "mb-1.5 block text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase";

/**
 * Storefront counterpart to the admin's `ActionForm`.
 *
 * It exists rather than reusing that one because the admin version publishes its
 * result through `useToast`, whose context defaults to a no-op outside
 * `ToastProvider` — dropped into the storefront it would submit successfully and
 * tell the customer nothing at all. Here the result renders inline, next to the
 * fields it came from.
 */
export function AccountForm({
  action,
  children,
  className = "",
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Rendered instead of the plain message when the action succeeds — used by
   *  the 2FA form, whose result carries recovery codes shown exactly once. */
  onSuccess?: (state: ActionState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.status === "error" && (
        <p className="mt-3 flex items-start gap-2 border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      )}
      {state.status === "success" &&
        (onSuccess ? (
          onSuccess(state)
        ) : (
          <p className="mt-3 flex items-start gap-2 border border-gold-dark/40 bg-gold/15 px-3 py-2 text-sm text-brown-900">
            <Check className="mt-0.5 size-4 shrink-0 text-gold-deep" />
            {state.message}
          </p>
        ))}
    </form>
  );
}

/** Submit button reflecting the enclosing form's pending state. */
export function AccountSubmit({
  children,
  tone = "dark",
  confirm,
}: {
  children: ReactNode;
  tone?: "gold" | "dark" | "quiet" | "danger";
  /** Ask before submitting. In-page rather than `window.confirm`, which a
   *  visitor can suppress permanently with "prevent additional dialogs" — and a
   *  suppressed confirm silently turns a guarded action unguarded. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);

  const tones = {
    gold: "bg-gold text-brown-950 hover:bg-gold-dark",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
    quiet: "border border-rule-strong text-brown-800 hover:bg-paper-warm",
    danger: "border border-danger/40 text-danger hover:bg-danger-soft",
  };

  if (asking) {
    return (
      <span className="inline-flex flex-wrap items-center gap-3">
        <span className="text-sm text-brown-800">{confirm}</span>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-danger-solid px-5 py-2.5 text-xs font-bold tracking-widest text-danger-solid-fg uppercase disabled:opacity-60"
        >
          {pending ? "Attendere…" : "Conferma"}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="text-sm text-taupe underline hover:text-brown-950"
        >
          Annulla
        </button>
      </span>
    );
  }

  return (
    <button
      type={confirm ? "button" : "submit"}
      onClick={confirm ? () => setAsking(true) : undefined}
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-6 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-60 ${tones[tone]}`}
    >
      {pending ? "Attendere…" : children}
    </button>
  );
}

/** A titled block on the settings page. */
export function AccountPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="card-shadow-soft border border-rule bg-paper p-5 sm:p-8">
      <h2 className="font-display text-xl font-semibold text-brown-950">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-brown-700">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
