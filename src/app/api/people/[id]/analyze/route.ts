import { NextResponse } from "next/server";
import { analyzePerson } from "@/lib/analyst";
import { db } from "@/lib/supabase";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/people/[id]/analyze">) {
  const { id } = await ctx.params;
  const { data: existing } = await db().from("profiles").select("data").eq("person_id", id).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, profile: existing.data });
  try {
    const profile = await analyzePerson(id);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    await db().from("people").update({ status: "failed", error: (e as Error).message.slice(0, 300) }).eq("id", id);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
