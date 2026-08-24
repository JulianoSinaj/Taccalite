import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentUser, listUserSessions } from "@/lib/auth/session";
import { otpauthUri } from "@/lib/auth/totp";
import { remainingRecoveryCodes } from "@/lib/auth/recovery-codes";
import { listAddresses } from "@/lib/addresses";
import AccountSettings from "@/components/account/AccountSettings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Impostazioni account",
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account");

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) redirect("/account");

  const [sessions, addresses] = await Promise.all([
    listUserSessions(user.id),
    listAddresses(user.id),
  ]);

  // Rendered server-side so `qrcode` never reaches the client bundle — the same
  // reason the loyalty card's QR is built here rather than in the browser.
  const uri = row.totpSecret ? otpauthUri(row.totpSecret, row.username) : "";
  const qrDataUrl = uri && !row.totpEnabled ? await QRCode.toDataURL(uri, { margin: 1, width: 200 }) : "";
  const storedCodes = row.totpRecoveryCodes ?? [];

  return (
    <div className="px-5 pt-28 pb-16 sm:px-8 sm:pt-32 sm:pb-20">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/account"
          className="inline-flex items-center gap-2 text-sm text-taupe transition-colors hover:text-brown-950"
        >
          <ArrowLeft className="size-4" />
          Area personale
        </Link>
        <h1 className="mt-6 mb-8 font-display display-md font-semibold text-brown-950">
          Impostazioni <span className="wonk text-gold-deep">account</span>
        </h1>

        <AccountSettings
          profile={{
            name: row.name,
            email: row.email,
            phone: row.phone,
            username: row.username,
          }}
          emailVerified={!!row.emailVerifiedAt}
          marketingConsent={row.marketingConsent}
          twoFactor={{
            enabled: row.totpEnabled,
            qrDataUrl,
            secret: row.totpEnabled ? null : row.totpSecret,
            remaining: remainingRecoveryCodes(storedCodes),
            issued: storedCodes.length,
          }}
          sessions={sessions}
          addresses={addresses.map((a) => ({
            id: a.id,
            label: a.label,
            name: a.name,
            phone: a.phone,
            street: a.street,
            city: a.city,
            postcode: a.postcode,
            province: a.province,
            isDefault: a.isDefault,
          }))}
        />
      </div>
    </div>
  );
}
