import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AdminNav from "@/components/admin/AdminNav";
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
    <div className="min-h-screen bg-cream text-brown-950 lg:flex">
      <AdminNav userName={user.name || user.email} />
      <div className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</div>
      </div>
    </div>
  );
}
