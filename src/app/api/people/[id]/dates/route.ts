import { NextResponse } from "next/server";
import { ensureDates } from "@/lib/dating";
import { isMatchable } from "@/lib/match";
import type { ProfileT, Seeking } from "@/lib/profile-schema";
import { db, must } from "@/lib/supabase";

/** Creates one date between this (visitor) person and every seed person they'd both want to meet. */
export async function POST(req: Request, ctx: RouteContext<"/api/people/[id]/dates">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { seeking?: Seeking; gender?: "woman" | "man" | "unknown" };
  const mine = must(await db().from("profiles").select("data").eq("person_id", id).single()) as { data: ProfileT };
  const me: ProfileT = { ...mine.data };
  let changed = false;
  if (body.seeking && ["women", "men", "everyone"].includes(body.seeking)) {
    me.seeking = body.seeking;
    changed = true;
  }
  if (body.gender && ["woman", "man", "unknown"].includes(body.gender)) {
    me.gender = { gender: body.gender, evidence: "Self-reported on the join form" };
    changed = true;
  }
  if (changed) must(await db().from("profiles").update({ data: me }).eq("person_id", id));
  const seeds = must(await db().from("profiles").select("person_id,data,people!inner(is_seed)").eq("people.is_seed", true).neq("person_id", id)) as
    { person_id: string; data: ProfileT }[];
  const others = seeds.filter((s) => isMatchable(me, s.data)).map((s) => s.person_id);
  const dates = await ensureDates(id, others);
  await db().from("people").update({ status: "dating" }).eq("id", id);
  return NextResponse.json({ dates: dates.map((d) => ({ id: d.id, partnerId: d.a_id === id ? d.b_id : d.a_id })) });
}
