"use client";

import { useActionState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { idleState, type ActionState } from "@/lib/admin/action-state";
import { useToast } from "./Toasts";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Submit button that reflects the enclosing form's pending state.
 *
 * The label stays rendered (just hidden) while pending, with the spinner overlaid
 * on top. Swapping the label out for a placeholder re-measured the button on every
 * click — a ★ toggle became three times wider mid-flight and shunted the rest of
 * the row sideways. Reserving the label's own width keeps the row still.
 */
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
      aria-busy={pending}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
      className={`relative rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-60 ${tones[tone]}`}
    >
      <span className={pending ? "invisible" : undefined}>{children}</span>
      {pending && (
        <span className="absolute inset-0 grid place-items-center">
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
          />
          <span className="sr-only">Invio in corso…</span>
        </span>
      )}
    </button>
  );
}

/**
 * Form bound to a server action that returns an ActionState.
 *
 * The result is published as a toast rather than rendered inline — see
 * `components/admin/Toasts.tsx` for why. Children receive nothing special; just
 * include the fields plus a `PendingButton`.
 */
export function ActionForm({
  action,
  children,
  className = "",
  id,
  redirectTo,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Lets inputs elsewhere on the page join this form via `form="<id>"` —
   *  used by the bulk bars, whose checkboxes live inside the rows. */
  id?: string;
  /** Where to go once the action succeeds. Set on the dedicated create/edit
   *  pages so saving returns the operator to that entity's list; omitted for the
   *  inline forms in list rows, which should leave the page where it is. */
  redirectTo?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    // Called from the action callback rather than an effect, so the toast is
    // published once per submission instead of on every re-render.
    toast(result);
    if (result.status === "success" && redirectTo) router.push(redirectTo);
    return result;
  }, idleState);

  return (
    <form id={id} action={formAction} className={className}>
      {children}
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
  redirectTo,
}: {
  action: Action;
  id: string;
  confirm?: string;
  children?: ReactNode;
  redirectTo?: string;
}) {
  return (
    <ActionForm action={action} className="inline-flex" redirectTo={redirectTo}>
      <input type="hidden" name="id" value={id} />
      <PendingButton tone="danger" confirm={confirm}>
        {children}
      </PendingButton>
    </ActionForm>
  );
}
