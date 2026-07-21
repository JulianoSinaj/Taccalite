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

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return <AuthForms />;

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
