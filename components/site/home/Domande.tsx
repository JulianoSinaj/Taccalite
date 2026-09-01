import { Phone } from "lucide-react";
import CTA from "@/components/site/CTA";
import Faq, { type FaqItem } from "@/components/site/Faq";
import type { getShops } from "@/lib/db/queries";

type Shop = Awaited<ReturnType<typeof getShops>>[number];

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * The questions people actually ask before they order for the first time.
 *
 * Last practical band on the page, on purpose: everything above it is an
 * invitation, and this is where somebody who is nearly convinced finds out
 * whether the shop delivers to them, what a price at the kilo means on their
 * receipt, and when the porchetta comes out. The answers are editable from
 * Gestionale → Testi del sito, so the shop can add whatever the phone keeps
 * asking it.
 */
export default function Domande({ faq, shops }: { faq: FaqItem[]; shops: Shop[] }) {
  return (
    <Faq
      items={faq}
      title={
        <>
          Le domande <span className="wonk text-gold-deep">che ci fate</span>
        </>
      }
      intro="Se la vostra non è qui, chiedetecela: al banco e al telefono rispondiamo volentieri."
      aside={
        <>
          {/* A phone number is the answer to every question that isn't listed,
              and on a phone it is one tap rather than a form. */}
          <div className="space-y-2">
            {shops.map((shop) =>
              shop.phone ? (
                <a
                  key={shop.slug}
                  href={telHref(shop.phone)}
                  className="group flex items-baseline gap-3 border-b border-rule py-3 text-[0.8125rem] text-taupe transition-colors hover:text-brown-950"
                >
                  <Phone
                    className="size-3.5 shrink-0 translate-y-0.5 text-gold-deep"
                    aria-hidden
                  />
                  <span className="font-medium text-brown-950">{shop.name}</span>
                  <span className="font-display ml-auto text-[1.0625rem] font-semibold tracking-[-0.01em] text-brown-950 tabular-nums transition-colors group-hover:text-gold-deep">
                    {shop.phone}
                  </span>
                </a>
              ) : null
            )}
          </div>
          <div className="mt-7">
            <CTA href="/contatti" tone="outline">
              Scrivici
            </CTA>
          </div>
        </>
      }
    />
  );
}
