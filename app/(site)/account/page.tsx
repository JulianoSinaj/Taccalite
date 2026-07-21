import type { Metadata } from "next";
import AuthForms from "@/components/account/AuthForms";
import AccountDashboard from "@/components/account/AccountDashboard";
import { getCurrentUser } from "@/lib/auth/session";
import { getLoyaltySummary } from "@/lib/loyalty";
import { getOrdersForUser } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Area Personale",
  description: "Accedi alla tua area personale Taccalite per consultare la scheda fedeltà.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return <AuthForms />;

  const [{ account, transactions, rewards, nextReward }, orders] = await Promise.all([
    getLoyaltySummary(user.id),
    getOrdersForUser(user.id),
  ]);

  return (
    <AccountDashboard
      name={user.name || user.username}
      points={account.points}
      cardNumber={account.cardNumber}
      nextReward={nextReward ? { name: nextReward.name, points: nextReward.points } : null}
      orders={orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt ?? new Date(),
        status: o.status,
        totalCents: o.totalCents,
        fulfilment: o.fulfilment,
      }))}
      rewards={rewards.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        points: r.points,
        image: r.image,
      }))}
      transactions={transactions.map((t) => ({
        id: t.id,
        delta: t.delta,
        reason: t.reason,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt ?? new Date(),
      }))}
    />
  );
}
