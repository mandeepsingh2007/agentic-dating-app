import { NextResponse } from "next/server";
import { normalizeInstagram, normalizeLinkedIn, startInstagram, startLinkedIn } from "@/lib/apify";
import { createPerson } from "@/lib/ingest";
import { db, must } from "@/lib/supabase";

const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { linkedin?: string; instagram?: string };
  const linkedin = normalizeLinkedIn(body.linkedin ?? "");
  const ig = normalizeInstagram(body.instagram ?? "");
  if (!linkedin) return NextResponse.json({ error: "Please paste a LinkedIn profile URL like https://www.linkedin.com/in/your-name" }, { status: 400 });
  if (!ig) return NextResponse.json({ error: "Please paste a public Instagram profile URL like https://www.instagram.com/yourname" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many runs from your network. Try again in an hour." }, { status: 429 });

  const id = await createPerson({ name: ig, linkedin_url: linkedin, instagram_url: `https://www.instagram.com/${ig}`, ig_username: ig, is_seed: false });
  const [{ data: prof }, { data: person }, { data: prior }] = await Promise.all([
    db().from("profiles").select("person_id").eq("person_id", id).maybeSingle(),
    db().from("people").select("is_seed").eq("id", id).single(),
    db().from("sources").select("status").eq("person_id", id),
  ]);
  const hadFailure = (prior ?? []).some((s) => s.status === "failed");
  if (prof && (person?.is_seed || !hadFailure)) return NextResponse.json({ personId: id, existing: true });
  if (prof) {
    // Retry after a failed source (e.g. Instagram was private): drop the stale profile and its dates, then scrape again.
    const { data: old } = await db().from("dates").select("id").or(`a_id.eq.${id},b_id.eq.${id}`);
    if (old?.length) must(await db().from("dates").delete().in("id", old.map((d) => d.id)));
    must(await db().from("rankings").delete().or(`person_id.eq.${id},candidate_id.eq.${id}`));
    must(await db().from("profiles").delete().eq("person_id", id));
  }

  const [liRun, igRun] = await Promise.all([startLinkedIn([linkedin]), startInstagram([ig])]);
  must(await db().from("sources").upsert([
    { person_id: id, kind: "linkedin", apify_run_id: liRun, status: "running" },
    { person_id: id, kind: "instagram", apify_run_id: igRun, status: "running" },
  ], { onConflict: "person_id,kind" }));
  await db().from("people").update({ status: "scraping", error: null }).eq("id", id);
  return NextResponse.json({ personId: id });
}
