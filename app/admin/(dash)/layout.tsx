import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AdminNav from "@/components/admin/AdminNav";
import CommandPalette from "@/components/admin/CommandPalette";
import { ToastProvider } from "@/components/admin/Toasts";
import { getCurrentUser } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import { getTheme, themeAttr } from "@/lib/admin/theme";
import { ephemeralDatabase } from "@/lib/db/client";
import { smtpAuthConfigured, smtpConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gestionale",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    redirect("/admin/login");
  }

  const theme = await getTheme();

  return (
    // ToastProvider wraps the whole dashboard (not each page) so a toast survives
    // the client-side navigation a save-and-redirect performs.
    <ToastProvider>
      {/* `admin-shell` is the scope hook for the gestionale's half of
          `globals.css` — density, word-breaking, press states, scroll shadows.
          Everything in that file's Phone section is scoped `.site-shell`, so
          without this the back office inherited none of the phone pass.

          `data-theme` goes here rather than on <html> because only the root
          layout renders that element, and the storefront must not inherit an
          inverted brand ramp. `body:has([data-theme])` in globals.css covers the
          overscroll strip that this leaves outside the themed subtree.

          `min-h-dvh`, not `min-h-screen`: `100vh` on a phone is the viewport
          with the browser chrome *hidden*, so the page is taller than the screen
          until you scroll — the jump every mobile layout has. */}
      <div
        className="admin-shell min-h-dvh bg-cream text-brown-950 lg:flex"
        data-theme={themeAttr(theme)}
      >
        <AdminNav
          userName={user.name || user.username}
          isAdmin={user.role === "admin"}
          themeToggle={<ThemeToggle current={theme} />}
        />
        <CommandPalette isAdmin={user.role === "admin"} />
        {/* `min-w-0` is the real fix for a flex item blowing out: it defaults to
            `min-width: auto`, which is what let a wide table push this column
            past the viewport in the first place.

            `overflow-x-clip` is the guard behind it, and specifically *not*
            `overflow-x-hidden` (which is what used to be here). `hidden`
            computes `overflow-y` to `auto`, making this a scroll container — and
            a scroll container becomes the scrollport every `position: sticky`
            inside it resolves against, so the sidebar, the mobile bar and the
            bulk bar would all have silently stopped sticking. `clip` clips
            without scrolling, so both properties hold at once.

            It is still needed: a wide `<table>` inside its own `overflow-x:auto`
            wrapper leaves the *root* scroller several hundred pixels of empty
            scrollable width in Chromium, even though every ancestor box measures
            the viewport width. The old `hidden` was covering that; without a
            replacement the orders list scrolled 445px sideways into nothing. */}
        <div className="min-w-0 flex-1 overflow-x-clip">
          {ephemeralDatabase && (
            <div
              role="alert"
              className="border-b border-warn/30 bg-warn-soft px-5 py-3 text-sm text-warn-soft-fg sm:px-8"
            >
              <strong className="font-semibold">Modalità demo:</strong> nessun database configurato su
              Vercel — il sito funziona ma ordini, prenotazioni, modifiche e accessi{" "}
              <strong className="font-semibold">non vengono salvati</strong> e spariscono a ogni riavvio.
              Per rendere i dati permanenti collega un database Turso (Vercel → Storage → Turso) e
              ridistribuisci. Vedi <code>DEPLOYMENT.md §V</code>.
            </div>
          )}
          {/* Not a nicety any more. Before self-service recovery existed, an
              unsent email was an inconvenience the shop could work around by
              phoning the customer. Now the reset link, the verification link and
              the order-claiming that hangs off it all travel by email — with no
              SMTP host, a customer who forgets their password is locked out with
              no way back, and nothing anywhere would say so. Hence an alert at
              the top of every page rather than a line in the settings screen.

              Gated on `smtpAuthConfigured`, not `smtpConfigured`: `.env.example`
              ships SMTP_HOST pre-filled with Brevo's relay and the credentials
              blank, which made `smtpConfigured` true and silenced this banner
              on the exact configuration that loses every message. Credentials
              missing is a louder failure than no host at all, because the mail
              is marked `failed` and retired after OUTBOX_MAX_ATTEMPTS rather
              than sitting `queued` waiting for a fix. */}
          {!smtpAuthConfigured && (
            <div
              role="alert"
              className="border-b border-danger/30 bg-danger-soft px-5 py-3 text-sm text-danger-soft-fg sm:px-8"
            >
              <strong className="font-semibold">Email non configurata:</strong>{" "}
              {smtpConfigured ? (
                <>
                  il server SMTP è impostato ma <code>SMTP_USER</code>/<code>SMTP_PASS</code>{" "}
                  sono vuoti, quindi l&apos;invio viene rifiutato e i messaggi finiscono{" "}
                  <strong className="font-semibold">in errore</strong>
                </>
              ) : (
                <>
                  nessun server SMTP impostato, quindi{" "}
                  <strong className="font-semibold">nessuna email parte davvero</strong>
                </>
              )}{" "}
              — conferme d&apos;ordine, prenotazioni e soprattutto i link per{" "}
              <strong className="font-semibold">reimpostare la password</strong>{" "}
              non arrivano al cliente; li trovi nell&apos;
              <a href="/admin/outbox" className="underline">outbox</a>. Finché resta così, un cliente
              che dimentica la password non può rientrare da solo. Imposta{" "}
              <code>SMTP_HOST</code>, <code>SMTP_USER</code> e <code>SMTP_PASS</code> (vedi{" "}
              <code>.env.example</code>).
            </div>
          )}
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
            {/* Derived from the path, so every route gets one - detail pages
                used to carry an ad-hoc back link, or nothing at all. */}
            <Breadcrumbs />
            {children}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
