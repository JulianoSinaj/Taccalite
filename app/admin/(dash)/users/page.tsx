import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, inputCls, fmtDate, Pagination } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getUsersPage } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth/session";
import { setUserRole, resetUserPassword } from "@/lib/admin/user-actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  customer: "Cliente",
  staff: "Staff",
  admin: "Amministratore",
};

type SP = { searchParams: Promise<{ page?: string }> };

export default async function AdminUsers({ searchParams }: SP) {
  // User management is admin-only (defence-in-depth beyond the nav gating).
  if (!(await isAdmin())) redirect("/admin");

  const { page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;
  const { rows: users, total, pageCount } = await getUsersPage({ page });

  return (
    <div>
      <AdminHeader title="Utenti" subtitle={`${total} account · gestisci ruoli e password`} />

      {users.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun utente.</p>
        </Panel>
      ) : (
      <div className="space-y-3">
        {users.map((u) => (
          <Panel key={u.id} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-display text-lg text-brown-950">
                {u.name || u.username}{" "}
                <span className="ml-1 rounded-full bg-brown-900/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                  {ROLE_LABEL[u.role] ?? u.role}
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
                <PendingButton tone="dark">Ruolo</PendingButton>
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
                <PendingButton tone="dark">Reset</PendingButton>
              </ActionForm>
            </div>
          </Panel>
        ))}
      </div>
      )}

      <Pagination basePath="/admin/users" page={page} pageCount={pageCount} />
    </div>
  );
}
