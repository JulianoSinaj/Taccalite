import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { RequestResetForm } from "@/components/account/PasswordForms";

export const metadata: Metadata = {
  title: "Recupera la password",
  robots: { index: false, follow: false },
};

export default function RecuperaPasswordPage() {
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
            Password <span className="wonk text-gold-deep">dimenticata</span>
          </h1>
        </div>
        <div className="card-shadow-soft border border-rule bg-paper p-5 sm:p-8 lg:p-12">
          <RequestResetForm />
        </div>
      </Reveal>
    </div>
  );
}
