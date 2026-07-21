"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireRole, deleteUserSessions } from "@/lib/auth/session";
import { hashPasswordAsync } from "@/lib/auth/password";
import { countAdmins } from "@/lib/admin/queries";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, userRoleInput, userPasswordInput } from "@/lib/validation/admin";

/** New-account fields. Username is normalised to lowercase and constrained to a
 *  safe handle charset; email is optional. */
const createUserInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Lo username deve avere almeno 3 caratteri")
    .max(40, "Lo username può avere al massimo 40 caratteri")
    .regex(/^[a-z0-9._-]+$/, "Username non valido (solo lettere minuscole, numeri, . _ -)"),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  email: z
    .string()
    .trim()
    .max(200)
    .email("Email non valida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(200),
  role: z.enum(["customer", "staff", "admin"]),
});

/** Toggle an account's active flag. */
const userActiveInput = z.object({
  id: z.string().trim().min(1),
  active: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => v === "on" || v === "true" || v === "1"),
});

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

/** Create a new account. Admin-only; rejects a duplicate username. */
export async function createUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireRole("admin");
    const d = parseForm(createUserInput, fd);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, d.username))
      .limit(1);
    if (existing) throw new ActionError("Username già in uso.");

    const passwordHash = await hashPasswordAsync(d.password);
    await db.insert(users).values({
      username: d.username,
      name: d.name,
      email: d.email,
      passwordHash,
      role: d.role,
    });

    revalidatePath("/admin/users");
    return ok("Utente creato.");
  });
}

/** Activate or deactivate an account. Admin-only; refuses to deactivate the last
 *  remaining admin and force-logs-out an account on deactivation. */
export async function setUserActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireRole("admin");
    const d = parseForm(userActiveInput, fd);

    const [target] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato");

    if (!d.active && target.role === "admin") {
      const admins = await countAdmins();
      if (admins <= 1) throw new ActionError("Non puoi disattivare l'ultimo amministratore.");
    }

    await db.update(users).set({ active: d.active }).where(eq(users.id, d.id));

    if (!d.active) {
      // A deactivation must take effect immediately: kill any live session.
      await deleteUserSessions(d.id);
    }

    revalidatePath("/admin/users");
    return ok(d.active ? "Utente riattivato." : "Utente disattivato.");
  });
}
