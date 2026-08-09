import Link from "next/link";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import {
  AdminHeader,
  Panel,
  inputCls,
  labelCls,
  fmtDate,
  Pagination,
  roleLabel,
  NewButton,
} from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getUsersPage } from "@/lib/admin/queries";
import { db } from "@/lib/db/client";
import { users as usersTable } from "@/lib/db/schema";
import { isAdmin } from "@/lib/auth/session";
import {
  setUserRole,
  resetUserPassword,
  setUserActive,
  updateUserProfile,
} from "@/lib/admin/user-actions";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ page?: string }> };

export default async function AdminUsers({ searchParams }: SP) {
  // User management is admin-only (defence-in-depth beyond the nav gating).
  if (!(await isAdmin())) redirect("/admin");

  const { page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;
  const { rows: users, total, pageCount } = await getUsersPage({ page });

  // `getUsersPage` doesn't expose the `active` flag, so resolve it for the
  // listed accounts in one extra lookup.
  const ids = users.map((u) => u.id);
  const activeRows = ids.length
    ? await db.select({ id: usersTable.id, active: usersTable.active }).from(usersTable).where(inArray(usersTable.id, ids))
    : [];
  const activeMap = new Map(activeRows.map((r) => [r.id, r.active]));

  return (
    <div>
      <AdminHeader
        title="Utenti"
        subtitle={`${total} account · gestisci ruoli e password`}
        action={<NewButton href="/admin/users/new">+ Nuovo utente</NewButton>}
      />

      {users.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun utente.</p>
        </Panel>
      ) : (
      <div className="space-y-3">
        {users.map((u) => {
          const active = activeMap.get(u.id) ?? true;
          return (
          <Panel key={u.id}>
           <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-display text-lg text-brown-950">
                {u.name || u.username}{" "}
                <span className="ml-1 rounded-full bg-brown-900/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                  {roleLabel(u.role)}
                </span>
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    active ? "bg-emerald-600/15 text-emerald-700" : "bg-red-600/15 text-red-600"
                  }`}
                >
                  {active ? "Attivo" : "Disattivato"}
                </span>
              </p>
              <p className="text-xs text-brown-800/60">
                @{u.username}
                {u.email ? ` · ${u.email}` : ""} · registrato {fmtDate(u.createdAt)}
              </p>
              <Link
                href={`/admin/loyalty/${u.id}`}
                className="mt-1 inline-block text-[11px] font-bold tracking-widest text-gold-dark uppercase hover:underline"
              >
                Scheda cliente →
              </Link>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <ActionForm action={setUserRole} className="flex items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <select name="role" defaultValue={u.role} className={`${inputCls} w-40`}>
                  <option value="customer">Cliente</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Amministratore</option>
                </select>
                <PendingButton tone="dark" confirm={`Cambiare il ruolo di @${u.username}? Le sessioni attive verranno chiuse.`}>
                  Ruolo
                </PendingButton>
              </ActionForm>
              <ActionForm action={resetUserPassword} className="flex items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input
                  name="password"
                  type="text"
                  minLength={8}
                  placeholder="Nuova password"
                  className={`${inputCls} w-44`}
                />
                <PendingButton tone="dark" confirm={`Reimpostare la password di @${u.username}? Le sessioni attive verranno chiuse.`}>
                  Reset
                </PendingButton>
              </ActionForm>
              <ActionForm action={setUserActive} className="flex items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="active" value={active ? "false" : "true"} />
                {active ? (
                  <PendingButton tone="danger" confirm={`Disattivare @${u.username}? L'account non potrà più accedere e le sessioni attive verranno chiuse.`}>
                    Disattiva
                  </PendingButton>
                ) : (
                  <PendingButton tone="dark">Riattiva</PendingButton>
                )}
              </ActionForm>
            </div>
           </div>

            {/* Contact details. Collapsed so the row stays scannable; username and
                role are changed through their own guarded controls above. */}
            <details className="mt-3 border-t border-brown-900/10 pt-3">
              <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                Modifica anagrafica
              </summary>
              <ActionForm action={updateUserProfile} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={u.id} />
                <div className="min-w-48 flex-1">
                  <label className={labelCls} htmlFor={`name-${u.id}`}>Nome</label>
                  <input id={`name-${u.id}`} name="name" required maxLength={200} defaultValue={u.name ?? ""} className={inputCls} />
                </div>
                <div className="min-w-48 flex-1">
                  <label className={labelCls} htmlFor={`email-${u.id}`}>Email</label>
                  <input id={`email-${u.id}`} name="email" type="email" maxLength={200} defaultValue={u.email ?? ""} className={inputCls} />
                </div>
                <div className="min-w-40">
                  <label className={labelCls} htmlFor={`phone-${u.id}`}>Telefono</label>
                  <input id={`phone-${u.id}`} name="phone" maxLength={40} defaultValue={u.phone ?? ""} className={inputCls} />
                </div>
                <PendingButton tone="dark">Salva anagrafica</PendingButton>
              </ActionForm>
              <p className="mt-2 text-xs text-brown-800/60">
                Cambiando l&apos;email, l&apos;indirizzo torna &laquo;da verificare&raquo;.
              </p>
            </details>
          </Panel>
          );
        })}
      </div>
      )}

      <Pagination basePath="/admin/users" page={page} pageCount={pageCount} />
    </div>
  );
}
