import type { Metadata } from "next";
import QRCode from "qrcode";
import AuthForms from "@/components/account/AuthForms";
import AccountDashboard from "@/components/account/AccountDashboard";
import { getCurrentUser } from "@/lib/auth/session";
import { getLoyaltySummary } from "@/lib/loyalty";
import { getOrdersForUser } from "@/lib/orders";
import { getReservationsForUser, getRedemptionsForUser } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Area Personale",
  description: "Accedi alla tua area personale Taccalite per consultare la scheda fedeltà.",
  robots: { index: false, follow: false },
};

type SearchParams = {
  searchParams: Promise<{ verifica?: string; ordini?: string; punti?: string }>;
};

export default async function AccountPage({ searchParams }: SearchParams) {
  const user = await getCurrentUser();
  if (!user) return <AuthForms />;

  // Set by the redirect out of /api/auth/email/verify.
  const { verifica, ordini, punti } = await searchParams;
  const claimed =
    verifica === "ok"
      ? { orders: Number(ordini ?? 0) || 0, points: Number(punti ?? 0) || 0 }
      : null;

  const [{ account, transactions, rewards, nextReward }, orders, reservations, redemptions] =
    await Promise.all([
      getLoyaltySummary(user.id),
      getOrdersForUser(user.id),
      getReservationsForUser(user.id),
      getRedemptionsForUser(user.id),
    ]);

  // Render the loyalty card number as a scannable QR (inline SVG) server-side, so
  // `qrcode` never enters the client bundle. Staff scan this on the in-shop screen.
  const qrSvg = await QRCode.toString(account.cardNumber, { type: "svg", margin: 1 });

  return (
    <AccountDashboard
      name={user.name || user.username}
      emailVerified={user.email ? !!user.emailVerifiedAt : null}
      claimed={claimed}
      points={account.points}
      cardNumber={account.cardNumber}
      qrSvg={qrSvg}
      nextReward={nextReward ? { name: nextReward.name, points: nextReward.points } : null}
      orders={orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt ?? new Date(),
        status: o.status,
        totalCents: o.totalCents,
        fulfilment: o.fulfilment,
      }))}
      reservations={reservations.map((r) => ({
        id: r.id,
        reference: r.reference,
        type: r.type,
        status: r.status,
        waitlisted: r.waitlisted,
        date: r.date,
        time: r.time,
        quantityKg: r.quantityKg,
        name: r.name,
      }))}
      redemptions={redemptions.map((r) => ({
        id: r.id,
        rewardName: r.rewardName,
        pointsSpent: r.pointsSpent,
        status: r.status,
        createdAt: r.createdAt ?? new Date(),
      }))}
      rewards={rewards.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        points: r.points,
        image: r.image,
        // Computed server-side by `rewardAvailability`, the same function
        // `redeemReward` refuses with — so the button and the endpoint cannot
        // disagree about whether a reward is claimable.
        unavailable: r.unavailable,
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
