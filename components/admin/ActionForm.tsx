"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { idleState, type ActionState } from "@/lib/admin/action-state";
import { ConfirmDialog } from "./ConfirmDialog";
import { UnsavedGuard } from "./UnsavedGuard";
import { useToast } from "./Toasts";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Which fields the last submission rejected, keyed by input `name`.
 *
 * Published by `ActionForm` and read by `FieldError` beside each input, so a
 * validation failure is visible *at* the field rather than only as a toast that
 * expires nine seconds later. Empty for every form that has not failed.
 */
const FieldErrorContext = createContext<Record<string, string>>({});

/**
 * The message for one field, plus the wiring an input needs to announce it.
 *
 * Render it under the control and spread `props` onto the control itself:
 *
 *     const slug = useFieldError("slug");
 *     <input id={fid("slug")} name="slug" {...slug.props} … />
 *     <FieldError name="slug" />
 */
export function useFieldError(name: string) {
  const errors = useContext(FieldErrorContext);
  const id = useId();
  const message = errors[name];
  return {
    message,
    props: message
      ? ({ "aria-invalid": true, "aria-describedby": id } as const)
      : ({} as Record<string, never>),
    id,
  };
}

/** The message itself. Renders nothing when the field is fine. */
export function FieldError({ name }: { name: string }) {
  const errors = useContext(FieldErrorContext);
  const message = errors[name];
  if (!message) return null;
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-danger" data-field-error={name}>
      <span aria-hidden>!</span>
      {message}
    </p>
  );
}

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
  confirmLabel,
  confirmTone,
  disabled = false,
}: {
  children: ReactNode;
  /** `ghost` is the icon-sized one: no ground of its own, for a control that
   *  sits inside something already coloured (the × on a saved view). It keeps
   *  the 44px target through `.tap` rather than through padding, so it doesn't
   *  stretch the pill it lives in. */
  tone?: "gold" | "dark" | "danger" | "ghost";
  confirm?: string;
  /** Wording and weight of the confirming button in the dialog. Needed when the
   *  trigger's own label is an icon (there is nothing to echo) or when a quiet
   *  trigger guards a destructive action. */
  confirmLabel?: string;
  confirmTone?: "danger" | "dark";
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
    ghost: "tap p-1 text-current opacity-60 hover:bg-black/10 hover:opacity-100",
  };
  const size = tone === "ghost" ? "" : "min-h-11 px-5 py-2.5";
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
        className={`relative inline-flex items-center justify-center rounded-full text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-60 ${size} ${tones[tone]}`}
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
      {/* Mounted only once it is actually asked for.
          One of these per confirmable control meant the users list shipped 120
          <dialog> elements — five a row, each with its own heading, message and
          two buttons — for confirmations that are almost never opened, and the
          page came to 766 KB of HTML for twenty-five rows. The dialog's effect
          runs on mount, so `showModal()` still fires on the same tick. */}
      {confirm && asking && (
        <ConfirmDialog
          open={asking}
          title="Confermi?"
          message={confirm}
          confirmLabel={confirmLabel ?? (typeof children === "string" ? children : "Conferma")}
          tone={confirmTone ?? (tone === "danger" ? "danger" : "dark")}
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
  guardUnsaved,
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
  /**
   * Ask before leaving with edits in the fields.
   *
   * The wording names what would be lost ("il prodotto"), because the dialog can
   * appear over any page. Set it on the long create/edit forms; NOT on the
   * one-button forms in list rows, where there is nothing to lose and the guard
   * would fire on every ★ toggle.
   */
  guardUnsaved?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  // Whether anything has been typed since the last successful save. Tracked from
  // the form's own bubbled events rather than per field: these forms are
  // uncontrolled by design, and reading twenty defaultValues back would be a
  // second source of truth for what the DOM already knows.
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    // Called from the action callback rather than an effect, so the toast is
    // published once per submission instead of on every re-render.
    toast(result);
    if (result.status === "success") {
      // Saved: the guard must be down *before* the redirect below, or the form
      // would block the navigation its own save just asked for.
      setDirty(false);
      onSuccess?.(result);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        // A form that stays put has to re-read its own record, or the operator
        // is left looking at the value they just replaced.
        //
        // The action's `revalidatePath` clears the *server* cache; it does not
        // re-render the page already on screen. So confirming a reservation
        // saved `confirmed`, toasted "Prenotazione aggiornata." — and left the
        // Stato dropdown reading "In attesa" until a manual reload, which is a
        // screen contradicting itself about whether the change took. Proven
        // with a browser: in-place value `pending`, value after reload
        // `confirmed`. `e2e/admin-forms.spec.ts` asserts the confirmed status
        // is on screen without reloading.
        //
        // A soft refresh: client state and scroll survive, only the server
        // components re-render.
        router.refresh();
      }
    }
    return result;
  }, idleState);

  const touch = guardUnsaved ? () => setDirty(true) : undefined;

  // Take the operator to the first rejected field.
  //
  // Keyed on the whole state object rather than on the field name, so
  // submitting twice with the same error focuses it again — the second attempt
  // is exactly when "which field?" needs answering. Falls back to scrolling the
  // message into view for a control the browser will not focus.
  useEffect(() => {
    const fieldErrors = state.fieldErrors;
    if (!fieldErrors) return;
    const form = formRef.current;
    if (!form) return;
    const first = Object.keys(fieldErrors)[0];
    const found = form.elements.namedItem(first);
    const control = found instanceof HTMLElement ? found : null;
    if (control) {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      form
        .querySelector('[data-field-error="' + CSS.escape(first) + '"]')
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // `state`, not `state.fieldErrors`: submitting twice with the same error
    // must focus the field again, and the second attempt is exactly when "which
    // field?" needs answering. `useActionState` returns a fresh object per
    // submission, so the identity change is the signal.
  }, [state]);

  return (
    <form
      ref={formRef}
      id={id}
      action={formAction}
      className={className}
      aria-label={ariaLabel}
      // Both: `onInput` catches typing, `onChange` catches selects, checkboxes
      // and file pickers, which do not fire an input event in every browser.
      onInput={touch}
      onChange={touch}
    >
      <FieldErrorContext.Provider value={state.fieldErrors ?? EMPTY_ERRORS}>
        {children}
      </FieldErrorContext.Provider>
      {guardUnsaved && <UnsavedGuard active={dirty} message={guardUnsaved} />}
    </form>
  );
}

/** A stable empty map, so a form with no errors doesn't hand its consumers a
 *  fresh object on every render. */
const EMPTY_ERRORS: Record<string, string> = {};

/**
 * A minimal confirm-then-submit form for destructive actions. Renders a single
 * hidden `id` field plus a danger button guarded by `ConfirmDialog`.
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
