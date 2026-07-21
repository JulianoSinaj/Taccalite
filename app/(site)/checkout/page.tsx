import type { Metadata } from "next";
import { getShops } from "@/lib/db/queries";
import CheckoutClient from "@/components/store/CheckoutClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const shops = await getShops();
  // Only shops with the store enabled can take pickup orders.
  const pickupShops = shops.filter((s) => s.storeEnabled).map((s) => ({ slug: s.slug, name: s.name }));
  return <CheckoutClient shops={pickupShops} />;
}
