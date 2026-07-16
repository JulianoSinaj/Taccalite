import type { Metadata } from "next";
import AuthForms from "@/components/account/AuthForms";
import AccountDashboard from "@/components/account/AccountDashboard";
import { getCurrentUser } from "@/lib/auth/session";
import { getLoyaltySummary } from "@/lib/loyalty";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Area Personale",
  description: "Accedi alla tua area personale Taccalite per consultare la scheda fedeltà.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return <AuthForms />;

  const { account, transactions, rewards, nextReward } = await getLoyaltySummary(user.id);

  return (
    <AccountDashboard
      name={user.name || user.email}
      points={account.points}
      cardNumber={account.cardNumber}
      nextReward={nextReward ? { name: nextReward.name, points: nextReward.points } : null}
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
