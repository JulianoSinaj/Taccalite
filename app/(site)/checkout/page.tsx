import type { Metadata } from "next";
import { getShops, getSetting } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import CheckoutClient from "@/components/store/CheckoutClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [shops, user, pointsPerEuro, loyaltyEnabled, shippingCents, freeShippingThresholdCents] =
    await Promise.all([
      getShops(),
      getCurrentUser(),
      getSetting<number>("loyalty.pointsPerEuro", 1),
      getSetting<boolean>("loyalty.enabled", true),
      getSetting<number>("store.shippingCents", 700),
      getSetting<number>("store.freeShippingThresholdCents", 0),
    ]);
  // Only shops with the store enabled can take pickup orders.
  const pickupShops = shops.filter((s) => s.storeEnabled).map((s) => ({ slug: s.slug, name: s.name }));
  return (
    <CheckoutClient
      shops={pickupShops}
      pointsPerEuro={pointsPerEuro}
      loyaltyEnabled={loyaltyEnabled}
      shippingCents={shippingCents}
      freeShippingThresholdCents={freeShippingThresholdCents}
      user={user ? { name: user.name, email: user.email, phone: user.phone } : null}
    />
  );
}
