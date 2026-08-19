import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AdminNav from "@/components/admin/AdminNav";
import CommandPalette from "@/components/admin/CommandPalette";
import { ToastProvider } from "@/components/admin/Toasts";
import { getCurrentUser } from "@/lib/auth/session";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { ephemeralDatabase } from "@/lib/db/client";

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

  return (
    // ToastProvider wraps the whole dashboard (not each page) so a toast survives
    // the client-side navigation a save-and-redirect performs.
    <ToastProvider>
      <div className="min-h-screen bg-cream text-brown-950 lg:flex">
        <AdminNav userName={user.name || user.username} isAdmin={user.role === "admin"} />
        <CommandPalette isAdmin={user.role === "admin"} />
        <div className="flex-1 overflow-x-hidden">
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
