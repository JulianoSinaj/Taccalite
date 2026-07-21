/**
 * Shared result type for admin server actions so forms can render inline
 * success/error feedback via `useActionState` instead of failing silently.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const idleState: ActionState = { status: "idle" };

/**
 * A deliberately user-facing error. Its message is safe to show to the client
 * (validation messages, business-rule violations). Anything else thrown inside
 * an action is treated as an unexpected internal error and NOT surfaced verbatim.
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export function ok(message = "Salvato."): ActionState {
  return { status: "success", message };
}

export function fail(message = "Si è verificato un errore."): ActionState {
  return { status: "error", message };
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
      return fail(err.message);
    }
    console.error("[admin action] unexpected error:", err);
    return fail("Si è verificato un errore imprevisto. Riprova.");
  }
}
