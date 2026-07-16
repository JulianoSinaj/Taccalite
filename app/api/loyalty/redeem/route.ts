import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { redeemReward } from "@/lib/loyalty";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Accedi per riscattare" }, { status: 401 });

  let body: { rewardId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }
  if (!body.rewardId) {
    return NextResponse.json({ ok: false, error: "Premio non specificato" }, { status: 400 });
  }

  const result = await redeemReward(user.id, body.rewardId);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
