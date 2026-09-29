import { NextResponse } from "next/server";
import { db, must } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** All dates with live status + message counts, for the Date Night grid. */
export async function GET(req: Request) {
  const personId = new URL(req.url).searchParams.get("person");
  let q = db().from("dates").select("id,a_id,b_id,status,round,finished_at,date_messages(count)").order("finished_at", { ascending: false, nullsFirst: true }).limit(1000);
  if (personId) q = q.or(`a_id.eq.${personId},b_id.eq.${personId}`);
  const rows = must(await q) as { id: string; a_id: string; b_id: string; status: string; date_messages: { count: number }[] }[];
  return NextResponse.json({
    dates: rows.map((r) => ({ id: r.id, a: r.a_id, b: r.b_id, status: r.status, messages: r.date_messages?.[0]?.count ?? 0 })),
  });
}
