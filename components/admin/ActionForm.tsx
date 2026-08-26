"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { idleState, type ActionState } from "@/lib/admin/action-state";
import { ConfirmDialog } from "./ConfirmDialog";
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
  disabled = false,
}: {
  children: ReactNode;
  tone?: "gold" | "dark" | "danger";
  confirm?: string;
  /** Blocks submission before the form is ready (e.g. an unresolved lookup). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tones = {
    gold: "bg-gold text-on-gold hover:bg-gold-dark",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
    danger: "bg-danger-solid text-danger-solid-fg hover:brightness-110",
  };
  return (
    <>
      <button
        ref={btnRef}
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
        // Intercept, ask in-page, then submit for real. `window.confirm` blocked
        // the browser and — worse — is suppressed outright once a user ticks
        // "prevent additional dialogs", turning a guarded action unguarded.
        onClick={
          confirm
            ? (e) => {
                if (asking) return; // the programmatic re-click, let it through
                e.preventDefault();
                setAsking(true);
              }
            : undefined
        }
        className={`relative inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-60 ${tones[tone]}`}
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
      {confirm && (
        <ConfirmDialog
          open={asking}
          title="Confermi?"
          message={confirm}
          confirmLabel={typeof children === "string" ? children : "Conferma"}
          tone={tone === "danger" ? "danger" : "dark"}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            // `asking` is still true on this click, so the handler above lets
            // the native submit through; it's cleared once the dialog is gone.
            btnRef.current?.click();
            setAsking(false);
          }}
        />
      )}
    </>
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
  onSuccess,
  "aria-label": ariaLabel,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Runs once per successful submission, with the action's result — for the
   *  forms that must react in-page (clear themselves, keep a payload on screen)
   *  rather than navigate. */
  onSuccess?: (result: ActionState) => void;
  /** Names the form for screen readers when it has no visible heading — a group
   *  of icon-only buttons (the theme switch) reads as loose controls without it. */
  "aria-label"?: string;
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
    if (result.status === "success") {
      onSuccess?.(result);
      if (redirectTo) router.push(redirectTo);
    }
    return result;
  }, idleState);

  return (
    <form id={id} action={formAction} className={className} aria-label={ariaLabel}>
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
