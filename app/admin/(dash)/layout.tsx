import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AdminNav from "@/components/admin/AdminNav";
import CommandPalette from "@/components/admin/CommandPalette";
import { ToastProvider } from "@/components/admin/Toasts";
import { getCurrentUser } from "@/lib/auth/session";

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
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}
