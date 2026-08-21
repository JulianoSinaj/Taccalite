"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { idleState, type ActionState } from "@/lib/admin/action-state";
import { ConfirmDialog } from "./ConfirmDialog";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function SubmitButton({
  children,
  confirm,
  tone = "dark",
}: {
  children: ReactNode;
  confirm?: string;
  tone?: "gold" | "dark";
}) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tones = {
    gold: "bg-gold text-on-gold hover:bg-gold-dark",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
  };
  return (
    <>
      <button
        ref={btnRef}
        type="submit"
        disabled={pending}
        onClick={
          confirm
            ? (e) => {
                if (asking) return;
                e.preventDefault();
                setAsking(true);
              }
            : undefined
        }
        className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-50 ${tones[tone]}`}
      >
        {pending ? "…" : children}
      </button>
      {confirm && (
        <ConfirmDialog
          open={asking}
          title="Confermi?"
          message={confirm}
          tone="dark"
          confirmLabel={typeof children === "string" ? children : "Conferma"}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            btnRef.current?.click();
            setAsking(false);
          }}
        />
      )}
    </>
  );
}

/**
 * A form whose action returns 2FA recovery codes to be shown exactly once.
 *
 * This can't use the shared `ActionForm`: the codes exist only in the action's
 * return value, because only their hashes are stored and the page can never
 * render them again. Both the enrolment step and the regenerate button go
 * through here, so a freshly issued batch is always displayed.
 *
 * `children` are extra fields rendered inside the form (the enrolment step puts
 * its 6-digit code input there).
 */
export function CodeRevealForm({
  action,
  buttonLabel,
  children,
  confirm,
  tone = "dark",
  meta,
}: {
  action: Action;
  buttonLabel: string;
  children?: ReactNode;
  confirm?: string;
  tone?: "gold" | "dark";
  /** Small line shown next to the button, e.g. "7 di 10 codici validi". */
  meta?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const codes = Array.isArray(state.data) ? (state.data as string[]) : null;

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        {children}
        <SubmitButton confirm={confirm} tone={tone}>
          {buttonLabel}
        </SubmitButton>
        {meta && <span className="text-sm text-brown-800/70">{meta}</span>}
      </form>

      {state.status === "error" && (
        <p className="mt-3 text-sm font-medium text-danger" role="status">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p className="mt-3 text-sm font-medium text-ok" role="status">
          {state.message}
        </p>
      )}

      {codes && (
        <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4">
          <p className="text-sm font-semibold text-brown-950">
            Salva questi codici adesso — non verranno mostrati di nuovo.
          </p>
          <p className="mt-1 text-xs text-brown-800/70">
            Ogni codice funziona una volta sola, al posto del codice dell&apos;app di
            autenticazione. Stampali o mettili in un gestore di password.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {codes.map((c) => (
              <li key={c} className="font-mono text-sm tracking-wider text-brown-950 select-all">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
