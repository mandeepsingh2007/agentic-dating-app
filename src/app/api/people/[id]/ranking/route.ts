import { NextResponse } from "next/server";
import { db, must } from "@/lib/supabase";

export async function GET(_req: Request, ctx: RouteContext<"/api/people/[id]/ranking">) {
  const { id } = await ctx.params;
  const ranking = must(await db().from("rankings").select("*").eq("person_id", id).order("rank"));
  return NextResponse.json({ ranking });
}
