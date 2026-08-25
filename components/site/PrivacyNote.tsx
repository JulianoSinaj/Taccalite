import Link from "next/link";

/**
 * The one-line privacy notice that belongs beside any form collecting personal
 * data (GDPR art. 13: the information has to be given *at the point of
 * collection*, not only somewhere on the site).
 *
 * Every public form here — newsletter, prenotazioni, contatti, avvisami,
 * checkout, registrazione — shipped with no mention of the privacy policy at
 * all. The only link to it was in the footer, which is not where someone is
 * looking when they type their phone number in.
 *
 * Presentational and dependency-free on purpose: most of these forms are client
 * components, so this has to render in both.
 */
export function PrivacyNote({
  tone = "light",
  action = "inviando questo modulo",
  terms = false,
  className = "",
}: {
  /** `dark` for the cream-on-brown surfaces (footer newsletter, hero forms). */
  tone?: "light" | "dark";
  /** Completes "…, accetti che…" — name the actual action, not "continuando". */
  action?: string;
  /** Also link the terms of sale. For the checkout, where a contract is formed. */
  terms?: boolean;
  className?: string;
}) {
  const base = tone === "dark" ? "text-cream/55" : "text-brown-800/60";
  const link =
    tone === "dark"
      ? "underline underline-offset-2 hover:text-cream"
      : "underline underline-offset-2 hover:text-brown-950";

  return (
    <p className={`text-xs leading-relaxed ${base} ${className}`}>
      {/* Explicit {" "}: the text after an expression container wraps onto the
          next line, and JSX trims that leading space — rendering
          "Iscrivendotiaccetti". */}
      {action.charAt(0).toUpperCase() + action.slice(1)}{" "}
      accetti il trattamento dei tuoi dati come descritto nell&apos;
      <Link href="/privacy" className={link}>
        informativa privacy
      </Link>
      {terms && (
        <>
          {" "}
          e le{" "}
          <Link href="/termini" className={link}>
            condizioni di vendita
          </Link>
        </>
      )}
      .
    </p>
  );
}
