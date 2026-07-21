"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireRole, deleteUserSessions } from "@/lib/auth/session";
import { hashPasswordAsync } from "@/lib/auth/password";
import { countAdmins } from "@/lib/admin/queries";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, userRoleInput, userPasswordInput } from "@/lib/validation/admin";

/** Change a user's role. Admin-only; refuses to demote the last remaining admin. */
export async function setUserRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireRole("admin");
    const d = parseForm(userRoleInput, fd);

    const [target] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato");

    if (target.role === "admin" && d.role !== "admin") {
      const admins = await countAdmins();
      if (admins <= 1) throw new ActionError("Non puoi rimuovere l'ultimo amministratore.");
    }

    await db.update(users).set({ role: d.role }).where(eq(users.id, d.id));
    // Force re-auth so the new privilege level takes effect immediately (a
    // demotion must not keep an elevated session alive).
    await deleteUserSessions(d.id);
    revalidatePath("/admin/users");
    return ok(`Ruolo aggiornato a "${d.role}".`);
  });
}

/** Reset a user's password. Admin-only. */
export async function resetUserPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireRole("admin");
    const d = parseForm(userPasswordInput, fd);
    const passwordHash = await hashPasswordAsync(d.password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, d.id));
    // A password reset must log the user out everywhere.
    await deleteUserSessions(d.id);
    revalidatePath("/admin/users");
    return ok("Password reimpostata.");
  });
}
