import Link from "next/link";
import { redirect } from "next/navigation";
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
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { PasswordField } from "@/components/admin/PasswordField";
import { getUsersPage, adminGetShops } from "@/lib/admin/queries";
import { userFilters } from "@/lib/admin/filters";
import { isAdmin } from "@/lib/auth/session";
import {
  unlockUser,
  setUserRole,
  resetUserPassword,
  setUserActive,
  updateUserProfile,
  resetUserTotp,
  setEmailVerified,
} from "@/lib/admin/user-actions";

export const dynamic = "force-dynamic";

const BASE = "/admin/users";

const ROLE_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "customer", label: "Clienti" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Amministratori" },
];

const STATUS_CHIPS = [
  { value: "all", label: "Qualsiasi stato" },
  { value: "attivi", label: "Attivi" },
  { value: "disattivati", label: "Disattivati" },
  { value: "da-verificare", label: "Email da verificare" },
  { value: "con-2fa", label: "Con 2FA" },
];

/**
 * Whether an account is currently shut out by the failed-attempt lock.
 *
 * `lockedUntil` is a timestamp rather than a flag precisely so the lock expires
 * on its own, which means "is it locked" is a question about *now* and not a
 * column to read. Resolved per render against one `Date` passed down, so every
 * row on the page agrees and no `new Date()` runs in a component body.
 */
function isLocked(u: { lockedUntil: Date | null }, now: Date): boolean {
  return !!u.lockedUntil && u.lockedUntil.getTime() > now.getTime();
}

/** Small state pill. */
function Tag({ tone, children }: { tone: "ok" | "warn" | "bad" | "mute"; children: React.ReactNode }) {
  const tones = {
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn-soft-fg",
    bad: "bg-danger-solid/15 text-danger",
    mute: "bg-brown-900/10 text-brown-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
}

type SP = { searchParams: Promise<{ page?: string; ruolo?: string; stato?: string; q?: string }> };

export default async function AdminUsers({ searchParams }: SP) {
  // User management is admin-only (defence-in-depth beyond the nav gating).
  if (!(await isAdmin())) redirect("/admin");

  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = userFilters(sp);
  const [{ rows: users, total, pageCount }, shops] = await Promise.all([
    getUsersPage({ ...filters, page }),
    adminGetShops(),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  // One reading of "now" for the whole page, so two rows can't disagree about
  // whether a lock has expired mid-render.
  const now = new Date();
  const locked = (u: { lockedUntil: Date | null }) => isLocked(u, now);
  const filtered = Object.values(filters).some((v) => v && v !== "all");

  return (
    <div>
      <AdminHeader
        title="Utenti"
        subtitle={`${total} account${filtered ? " nel filtro attuale" : ""} · ruoli, password e accessi`}
        action={<NewButton href="/admin/users/new">+ Nuovo utente</NewButton>}
      />

      <SegmentedFilter
        basePath={BASE}
        params={filters}
        name="ruolo"
        options={ROLE_CHIPS}
        label="Filtra per ruolo"
      />
      <FilterToolbar
        basePath={BASE}
        params={filters}
        searchPlaceholder="Nome, username o email…"
        carry={["ruolo"]}
        formId="users-filters"
        facets={[{ name: "stato", label: "Stato", options: STATUS_CHIPS }]}
      />
      <ActiveFilters
        basePath={BASE}
        params={filters}
        labels={{
          ruolo: { title: "Ruolo", format: labelFrom(ROLE_CHIPS) },
          stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      {users.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {filtered ? "Nessun account corrisponde ai filtri." : "Nessun utente."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Panel key={u.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-display flex flex-wrap items-center gap-1.5 text-lg text-brown-950">
                    {u.name || u.username}
                    <Tag tone="mute">{roleLabel(u.role)}</Tag>
                    <Tag tone={u.active ? "ok" : "bad"}>{u.active ? "Attivo" : "Disattivato"}</Tag>
                    {/* Verification and 2FA state were invisible here, so a
                        locked-out or unverified account looked like any other. */}
                    {u.email &&
                      (u.emailVerifiedAt ? (
                        <Tag tone="ok">Email verificata</Tag>
                      ) : (
                        <Tag tone="warn">Email da verificare</Tag>
                      ))}
                    {u.totpEnabled && <Tag tone="ok">2FA</Tag>}
                    {/* The access state the page is named after. Written on
                        every sign-in and every failure, and shown nowhere — so a
                        locked-out account looked exactly like a forgotten
                        password, and neither had an answer here. */}
                    {locked(u) && <Tag tone="bad">Bloccato</Tag>}
                    {/* An unassigned staff account sees both locations, which is
                        the old behaviour and worth saying out loud rather than
                        leaving as an absence. */}
                    {u.role === "staff" && (
                      <Tag tone={u.shopSlug ? "mute" : "warn"}>
                        {u.shopSlug ? (shopName.get(u.shopSlug) ?? u.shopSlug) : "Tutte le sedi"}
                      </Tag>
                    )}
                  </p>
                  <p className="text-xs text-brown-800/60">
                    @{u.username}
                    {u.email ? ` · ${u.email}` : ""} · registrato {fmtDate(u.createdAt)}
                    {u.lastLoginAt
                      ? ` · ultimo accesso ${fmtDate(u.lastLoginAt)}`
                      : " · mai entrato"}
                  </p>
                  {locked(u) && (
                    <p className="mt-1 text-xs font-semibold text-danger-soft-fg">
                      Bloccato dopo {u.failedLoginCount} tentativi falliti, fino alle{" "}
                      {u.lockedUntil?.toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      . Si sblocca da solo, oppure subito qui sotto.
                    </p>
                  )}
                  <Link
                    href={`/admin/loyalty/${u.id}`}
                    className="mt-1 inline-block text-[12px] font-bold tracking-widest text-gold-dark uppercase hover:underline"
                  >
                    Scheda cliente →
                  </Link>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <ActionForm action={setUserRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Ruolo di {u.username}
                    </label>
                    <select id={`role-${u.id}`} name="role" defaultValue={u.role} className={`${inputCls} w-40`}>
                      <option value="customer">Cliente</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Amministratore</option>
                    </select>
                    {/* Submitted with the role, because the two are one
                        privilege: it is ignored for a customer or an admin. */}
                    <label className="sr-only" htmlFor={`shop-${u.id}`}>
                      Sede di {u.username}
                    </label>
                    <select
                      id={`shop-${u.id}`}
                      name="shopSlug"
                      defaultValue={u.shopSlug ?? ""}
                      className={`${inputCls} w-40`}
                    >
                      <option value="">Tutte le sedi</option>
                      {shops.map((sh) => (
                        <option key={sh.slug} value={sh.slug}>
                          {sh.name}
                        </option>
                      ))}
                    </select>
                    <PendingButton
                      tone="dark"
                      confirm={`Cambiare il ruolo di @${u.username}? Le sessioni attive verranno chiuse.`}
                    >
                      Ruolo
                    </PendingButton>
                  </ActionForm>
                  <ActionForm action={resetUserPassword} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <PasswordField id={`pw-${u.id}`} label={`Nuova password per ${u.username}`} />
                    <PendingButton
                      tone="dark"
                      confirm={`Reimpostare la password di @${u.username}? Le sessioni attive verranno chiuse.`}
                    >
                      Reset
                    </PendingButton>
                  </ActionForm>
                  <ActionForm action={setUserActive} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                    {u.active ? (
                      <PendingButton
                        tone="danger"
                        confirm={`Disattivare @${u.username}? L'account non potrà più accedere e le sessioni attive verranno chiuse.`}
                      >
                        Disattiva
                      </PendingButton>
                    ) : (
                      <PendingButton tone="dark">Riattiva</PendingButton>
                    )}
                  </ActionForm>
                </div>
              </div>

              {/* Recovery actions: the ones an operator reaches for when someone
                  can't get in. Collapsed so the row stays scannable. */}
              <details className="mt-3 border-t border-brown-900/10 pt-3">
                <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                  Anagrafica e accesso
                </summary>

                <ActionForm action={updateUserProfile} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={u.id} />
                  <div className="min-w-48 flex-1">
                    <label className={labelCls} htmlFor={`name-${u.id}`}>
                      Nome
                    </label>
                    <input
                      id={`name-${u.id}`}
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={u.name ?? ""}
                      className={inputCls}
                    />
                  </div>
                  <div className="min-w-48 flex-1">
                    <label className={labelCls} htmlFor={`email-${u.id}`}>
                      Email
                    </label>
                    <input
                      id={`email-${u.id}`}
                      name="email"
                      type="email"
                      maxLength={200}
                      defaultValue={u.email ?? ""}
                      className={inputCls}
                    />
                  </div>
                  <div className="min-w-40">
                    <label className={labelCls} htmlFor={`phone-${u.id}`}>
                      Telefono
                    </label>
                    <input
                      id={`phone-${u.id}`}
                      name="phone"
                      maxLength={40}
                      defaultValue={u.phone ?? ""}
                      className={inputCls}
                    />
                  </div>
                  <PendingButton tone="dark">Salva anagrafica</PendingButton>
                </ActionForm>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brown-900/10 pt-3">
                  {u.email && (
                    <ActionForm action={setEmailVerified} className="inline-flex">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="verified" value={u.emailVerifiedAt ? "false" : "true"} />
                      <PendingButton tone="dark">
                        {u.emailVerifiedAt ? "Segna email da verificare" : "Segna email verificata"}
                      </PendingButton>
                    </ActionForm>
                  )}
                  {locked(u) && (
                    <>
                      <ActionForm action={unlockUser} className="inline-flex">
                        <input type="hidden" name="id" value={u.id} />
                        <PendingButton tone="dark">Sblocca ora</PendingButton>
                      </ActionForm>
                      {/* A lockout usually means somebody was guessing. If the
                          guessing worked, ending the sessions is the response
                          that matters. */}
                      <ActionForm action={unlockUser} className="inline-flex">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="signOut" value="true" />
                        <PendingButton
                          tone="danger"
                          confirm={`Sbloccare @${u.username} e chiudere tutte le sue sessioni? Dovrà accedere di nuovo su ogni dispositivo.`}
                        >
                          Sblocca e disconnetti
                        </PendingButton>
                      </ActionForm>
                    </>
                  )}
                  {u.totpEnabled && (
                    <ActionForm action={resetUserTotp} className="inline-flex">
                      <input type="hidden" name="id" value={u.id} />
                      <PendingButton
                        tone="danger"
                        confirm={`Azzerare la verifica in due passaggi di @${u.username}? Potrà accedere con la sola password finché non la riattiva. Le sessioni attive verranno chiuse.`}
                      >
                        Azzera 2FA
                      </PendingButton>
                    </ActionForm>
                  )}
                </div>
                <p className="mt-2 text-xs text-brown-800/60">
                  Usa «Azzera 2FA» quando qualcuno ha perso sia il telefono sia i codici di recupero.
                  Cambiando l&apos;email, l&apos;indirizzo torna &laquo;da verificare&raquo;.
                </p>
              </details>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={filters} />
    </div>
  );
}
