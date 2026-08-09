import { redirect } from "next/navigation";
import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { UserForm } from "@/components/admin/forms";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewUser() {
  if (!(await isAdmin())) redirect("/admin");
  return (
    <div>
      <BackLink href="/admin/users">Utenti</BackLink>
      <AdminHeader title="Nuovo utente" subtitle="Crea un account cliente, staff o amministratore" />
      <Panel>
        <UserForm />
      </Panel>
    </div>
  );
}
