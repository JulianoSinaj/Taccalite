"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export async function updateOrderStatus(fd: FormData) {
  await requireAdmin();
  const id = (fd.get("id") ?? "").toString();
  const status = (fd.get("status") ?? "").toString() as
    | "pending"
    | "paid"
    | "fulfilled"
    | "cancelled"
    | "refunded";
  if (!id) return;
  await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, id));
  revalidatePath("/admin/orders");
}
