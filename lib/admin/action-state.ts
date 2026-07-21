/**
 * Shared result type for admin server actions so forms can render inline
 * success/error feedback via `useActionState` instead of failing silently.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const idleState: ActionState = { status: "idle" };

export function ok(message = "Salvato."): ActionState {
  return { status: "success", message };
}

export function fail(message = "Si è verificato un errore."): ActionState {
  return { status: "error", message };
}

/**
 * Wrap an action body so any thrown error (including Zod and auth failures)
 * becomes an error ActionState rather than an unhandled exception / dev overlay.
 */
export async function runAction(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return fail("Non hai i permessi per questa operazione.");
    }
    return fail(err instanceof Error ? err.message : "Si è verificato un errore.");
  }
}
