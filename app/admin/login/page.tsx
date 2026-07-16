import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accesso gestionale",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user && (user.role === "admin" || user.role === "staff")) redirect("/admin");
  const wrongRole = !!user; // logged in but not staff/admin

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1c1512] px-5 py-20">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-bold tracking-tighter text-cream uppercase">
            Taccalite
          </p>
          <p className="text-[10px] font-bold tracking-[0.4em] text-gold uppercase">Gestionale</p>
        </div>
        <AdminLoginForm wrongRole={wrongRole} />
      </div>
    </div>
  );
}
