import { NextResponse } from "next/server";
import { createPoolDates, seedIds } from "@/lib/pool";
import { computeRanking } from "@/lib/ranking";
import { db, must } from "@/lib/supabase";

export const maxDuration = 300;

/**
 * Admin actions for the seed pool (protected by ADMIN_SECRET):
 * - "pool": create all missing pool dates, return pending ids for the browser to run
 * - "replay": reset N finished pool dates so they can be re-run live on screen
 * - "rank": recompute every seed person's ranking
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { secret?: string; action?: string; count?: number };
  if (!process.env.ADMIN_SECRET || body.secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Wrong admin secret" }, { status: 401 });
  }
  if (body.action === "pool") return NextResponse.json({ ids: await createPoolDates() });
  if (body.action === "replay") {
    const seeds = new Set(await seedIds());
    const done = must(await db().from("dates").select("id,a_id,b_id").eq("status", "done").eq("round", 1).limit(1000)) as { id: string; a_id: string; b_id: string }[];
    const pool = done.filter((d) => seeds.has(d.a_id) && seeds.has(d.b_id)).sort(() => Math.random() - 0.5).slice(0, Math.min(body.count ?? 24, 60));
    const ids = pool.map((d) => d.id);
    if (ids.length) {
      await db().from("date_messages").delete().in("date_id", ids);
      await db().from("verdicts").delete().in("date_id", ids);
      await db().from("dates").update({ status: "pending", finished_at: null }).in("id", ids);
    }
    return NextResponse.json({ ids });
  }
  if (body.action === "rank") {
    const ids = await seedIds();
    await Promise.all(ids.map((id) => computeRanking(id)));
    return NextResponse.json({ ranked: ids.length });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
