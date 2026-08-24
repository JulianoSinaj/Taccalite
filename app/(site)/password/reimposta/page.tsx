import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { ResetPasswordForm } from "@/components/account/PasswordForms";
import { inspectToken } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scegli una nuova password",
  robots: { index: false, follow: false },
};

type SearchParams = { searchParams: Promise<{ token?: string }> };

export default async function ReimpostaPasswordPage({ searchParams }: SearchParams) {
  const { token = "" } = await searchParams;
  // Inspected, not consumed: the visitor learns the link is dead *before* typing
  // a password twice, and a dead link is described accurately ("già usato" vs
  // "scaduto") rather than as a flat failure.
  const state = await inspectToken(token, "password_reset");

  return (
    <div className="px-5 pt-28 pb-16 sm:px-8 sm:pt-32 sm:pb-20">
      <Reveal className="mx-auto max-w-xl">
        <div className="mb-8 space-y-4 text-center sm:mb-12">
          <p className="inline-flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Il tuo account
            <span aria-hidden className="h-px w-10 bg-gold" />
          </p>
          <h1 className="font-display display-lg font-semibold text-brown-950">
            Nuova <span className="wonk text-gold-deep">password</span>
          </h1>
        </div>
        <div className="card-shadow-soft border border-rule bg-paper p-5 sm:p-8 lg:p-12">
          <ResetPasswordForm token={token} state={state} />
        </div>
      </Reveal>
    </div>
  );
}
