/**
 * Shared result type for admin server actions so forms can render inline
 * success/error feedback via `useActionState` instead of failing silently.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /**
   * Which field the message is about, keyed by the control's `name`.
   *
   * Without this an error was a toast and nothing else: "Esiste già una
   * categoria con lo slug «salumi»" appeared bottom-right for nine seconds,
   * marked nothing, focused nothing, and expired — on a form of twenty-odd
   * fields the operator was left to work out which one it meant. `ActionForm`
   * publishes this to the fields, which mark themselves invalid and take focus.
   *
   * Only errors that genuinely belong to one input carry it. "Sessione scaduta"
   * does not, and stays a toast.
   */
  fieldErrors?: Record<string, string>;
  /**
   * One-time payload for the rare action whose result the server can't render
   * again later — currently only freshly generated 2FA recovery codes, which are
   * stored hashed and so are visible exactly once. Most actions leave this unset.
   */
  data?: unknown;
};

export const idleState: ActionState = { status: "idle" };

/**
 * A deliberately user-facing error. Its message is safe to show to the client
 * (validation messages, business-rule violations). Anything else thrown inside
 * an action is treated as an unexpected internal error and NOT surfaced verbatim.
 */
export class ActionError extends Error {
  /** The `name` of the input this is about, when it is about one. */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ActionError";
    this.field = field;
  }
}

export function ok(message = "Salvato.", data?: unknown): ActionState {
  return { status: "success", message, ...(data === undefined ? {} : { data }) };
}

export function fail(
  message = "Si è verificato un errore.",
  fieldErrors?: Record<string, string>,
): ActionState {
  return { status: "error", message, ...(fieldErrors ? { fieldErrors } : {}) };
}

/**
 * Wrap an action body so any thrown error becomes an error ActionState rather
 * than an unhandled exception / dev overlay. Only *intended* messages reach the
 * client — auth failures map to friendly copy and `ActionError` is shown as-is;
 * every other (unexpected) error is logged server-side and returns a generic
 * message so internal details (DB/SQLite text, stack info) never leak to the UI.
 */
export async function runAction(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return fail("Non hai i permessi per questa operazione.");
    }
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return fail("Sessione scaduta. Accedi di nuovo.");
    }
    if (err instanceof ActionError) {
      // A field-scoped error is still shown as a toast as well: the field may be
      // scrolled off screen, and the toast is what says "the save did not happen".
      return fail(err.message, err.field ? { [err.field]: err.message } : undefined);
    }
    console.error("[admin action] unexpected error:", err);
    return fail("Si è verificato un errore imprevisto. Riprova.");
  }
}
