import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AdminHeader,
  Panel,
  BackLink,
  StatusBadge,
  Pagination,
  euro,
  fmtDateTime,
  statusLabel,
} from "@/components/admin/ui";
import { DiscountForm } from "@/components/admin/forms";
import { adminGetDiscount, adminGetShops } from "@/lib/admin/queries";
import { discountState, getDiscountUses, summarizeDiscountUses } from "@/lib/discounts";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Ledger rows per page. The list used to stop at 100 without saying so. */
const USES_PAGE = 50;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function EditDiscount({ params, searchParams }: Props) {
  if (!(await isAdmin())) redirect("/admin");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const discount = await adminGetDiscount(id);
  if (!discount) notFound();

  const [shops, summary] = await Promise.all([adminGetShops(), summarizeDiscountUses(discount.code)]);
  const pageCount = Math.max(1, Math.ceil(summary.count / USES_PAGE));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const uses = await getDiscountUses(discount.code, { limit: USES_PAGE, offset: (page - 1) * USES_PAGE });

  const state = discountState(discount);
  const subtitle = [
    state === "active" ? "Utilizzabile" : statusLabel(state),
    `usato ${discount.timesUsed} volte${discount.maxRedemptions != null ? ` su ${discount.maxRedemptions}` : ""}`,
    summary.amountCents > 0 ? `${euro(summary.amountCents)} scontati` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <BackLink href="/admin/discounts">Codici sconto</BackLink>
      <AdminHeader title={`Codice ${discount.code}`} subtitle={subtitle} />
      <Panel>
        <DiscountForm discount={discount} shops={shops} />
      </Panel>

      {/* The drill-down behind the counter. `timesUsed` alone couldn't answer
          "who used this and on what", which is the question a promotion that
          looks too popular always raises. */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">
        Utilizzi{summary.count > 0 ? ` (${summary.count})` : ""}
      </h2>
      {uses.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            Questo codice non risulta usato su nessun ordine.
            {discount.timesUsed > 0 &&
              " Il contatore include utilizzi precedenti alla registrazione dei singoli riscatti."}
          </p>
        </Panel>
      ) : (
        <Panel className="scroll-x p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brown-900/10 text-left text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Ordine</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3 text-right">Sconto</th>
                <th className="px-5 py-3 text-right">Totale ordine</th>
              </tr>
            </thead>
            <tbody>
              {uses.map((u) => (
                <tr key={u.redemption.id} className="border-b border-brown-900/5 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap text-brown-800/70">
                    {fmtDateTime(u.redemption.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    {u.redemption.orderId ? (
                      <Link
                        href={`/admin/orders/${u.redemption.orderId}`}
                        className="font-mono text-xs font-semibold text-brown-950 hover:underline"
                      >
                        {u.orderNumber ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-brown-800/50">—</span>
                    )}
                    {u.orderStatus && (
                      <span className="ml-2">
                        <StatusBadge status={u.orderStatus} />
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-brown-800/80">
                    {u.redemption.userId ? (
                      <Link href={`/admin/loyalty/${u.redemption.userId}`} className="hover:underline">
                        {u.redemption.email ?? "cliente registrato"}
                      </Link>
                    ) : (
                      (u.redemption.email ?? "ospite")
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-brown-950">
                    {euro(u.redemption.amountCents)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-brown-800/70">
                    {u.orderTotalCents != null ? euro(u.orderTotalCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Pagination basePath={`/admin/discounts/${discount.id}`} page={page} pageCount={pageCount} />
    </div>
  );
}
