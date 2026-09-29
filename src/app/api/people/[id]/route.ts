import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export async function GET(_req: Request, ctx: RouteContext<"/api/people/[id]">) {
  const { id } = await ctx.params;
  const [person, sources, profile] = await Promise.all([
    db().from("people").select("id,name,headline,photo_url,status,error,is_seed").eq("id", id).maybeSingle(),
    db().from("sources").select("kind,status,error").eq("person_id", id),
    db().from("profiles").select("data").eq("person_id", id).maybeSingle(),
  ]);
  if (!person.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ person: person.data, sources: sources.data ?? [], profile: profile.data?.data ?? null });
}
