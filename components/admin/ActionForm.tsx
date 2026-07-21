"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { idleState, type ActionState } from "@/lib/admin/action-state";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Submit button that reflects the enclosing form's pending state. */
export function PendingButton({
  children,
  tone = "gold",
  confirm,
}: {
  children: ReactNode;
  tone?: "gold" | "dark" | "danger";
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  const tones = {
    gold: "bg-gold text-brown-950 hover:bg-gold-dark",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
      className={`rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-50 ${tones[tone]}`}
    >
      {pending ? "…" : children}
    </button>
  );
}

/** Inline success/error banner driven by the action's returned state. */
function Feedback({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`text-sm font-medium ${
        state.status === "error" ? "text-red-600" : "text-emerald-700"
      }`}
      role="status"
    >
      {state.message}
    </p>
  );
}

/**
 * Form bound to a server action that returns an ActionState, rendering inline
 * feedback. Children receive nothing special — just include the fields + a
 * PendingButton.
 */
export function ActionForm({
  action,
  children,
  className = "",
}: {
  action: Action;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className={className}>
      {children}
      <Feedback state={state} />
    </form>
  );
}

/**
 * A minimal confirm-then-submit form for destructive actions. Renders a single
 * hidden `id` field plus a danger button guarded by a native confirm().
 */
export function DeleteForm({
  action,
  id,
  confirm = "Confermi l'eliminazione? L'operazione non è reversibile.",
  children = "Elimina",
}: {
  action: Action;
  id: string;
  confirm?: string;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <PendingButton tone="danger" confirm={confirm}>
        {children}
      </PendingButton>
      {state.status === "error" && (
        <span className="max-w-xs text-right text-xs text-red-600">{state.message}</span>
      )}
    </form>
  );
}
