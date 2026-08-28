import { describe, expect, it, vi } from "vitest";
import { ActionError, fail, ok, runAction } from "@/lib/admin/action-state";

/**
 * How an action's failure reaches the operator.
 *
 * A message alone was all these carried, so a rejected save was a toast that
 * marked nothing and expired — on a twenty-field form, "Esiste già una categoria
 * con lo slug «salumi»" left the operator to find the field themselves.
 * `ActionError` can now name the input it is about, and `runAction` is what
 * turns that into something `ActionForm` can mark, describe and focus.
 */
describe("runAction", () => {
  it("passes a plain ActionError through as a message with no field", async () => {
    const state = await runAction(async () => {
      throw new ActionError("Prodotto non trovato.");
    });
    expect(state).toEqual({ status: "error", message: "Prodotto non trovato." });
    expect(state.fieldErrors).toBeUndefined();
  });

  it("carries a field-scoped error on both channels", async () => {
    const state = await runAction(async () => {
      throw new ActionError("Username già in uso.", "username");
    });
    expect(state.status).toBe("error");
    // The toast still fires: the field may be scrolled off screen, and the toast
    // is what says the save did not happen.
    expect(state.message).toBe("Username già in uso.");
    expect(state.fieldErrors).toEqual({ username: "Username già in uso." });
  });

  it("does not attach a field to auth failures", async () => {
    for (const [thrown, expected] of [
      ["FORBIDDEN", "Non hai i permessi per questa operazione."],
      ["UNAUTHENTICATED", "Sessione scaduta. Accedi di nuovo."],
    ] as const) {
      const state = await runAction(async () => {
        throw new Error(thrown);
      });
      expect(state).toEqual({ status: "error", message: expected });
    }
  });

  it("never leaks an unexpected error's own text", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await runAction(async () => {
      throw new Error("SQLITE_CONSTRAINT: products.slug");
    });
    expect(state.message).toBe("Si è verificato un errore imprevisto. Riprova.");
    expect(state.fieldErrors).toBeUndefined();
    spy.mockRestore();
  });

  it("returns a success untouched", async () => {
    expect(await runAction(async () => ok("Salvato."))).toEqual({
      status: "success",
      message: "Salvato.",
    });
  });
});

describe("fail", () => {
  it("omits fieldErrors entirely when there are none", () => {
    expect(fail("Boom.")).toEqual({ status: "error", message: "Boom." });
  });

  it("keeps them when given", () => {
    expect(fail("Boom.", { slug: "Boom." })).toEqual({
      status: "error",
      message: "Boom.",
      fieldErrors: { slug: "Boom." },
    });
  });
});
