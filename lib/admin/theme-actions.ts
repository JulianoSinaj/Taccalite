"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { THEMES, THEME_COOKIE, THEME_LABELS, type Theme } from "@/lib/admin/theme";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Store the operator's theme preference.
 *
 * A per-browser cookie rather than a column on the user: it is a property of
 * where you are sitting, not of who you are — the same person wants dark on the
 * laptop in the back office and light on the tablet by the window.
 *
 * Not `httpOnly`, so a future client-side toggle could read it, but `sameSite:
 * lax` and no sensitive content. Revalidating the whole admin layout is what
 * repaints every open panel.
 */
export async function setTheme(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    // Staff too: which theme a screen is set to is a property of the screen,
    // not a privilege — and the counter tablet is the one that most wants it.
    await requireRole("admin", "staff");
    const theme = String(fd.get("theme") ?? "") as Theme;
    if (!THEMES.includes(theme)) throw new ActionError("Tema non valido.");

    (await cookies()).set(THEME_COOKIE, theme, {
      path: "/",
      maxAge: YEAR_SECONDS,
      sameSite: "lax",
    });

    revalidatePath("/admin", "layout");
    return ok(`Tema: ${THEME_LABELS[theme].toLowerCase()}.`);
  });
}
