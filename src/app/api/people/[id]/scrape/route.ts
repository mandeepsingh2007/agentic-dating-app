import { NextResponse } from "next/server";
import { getItems, getRun } from "@/lib/apify";
import { storeScrape } from "@/lib/ingest";
import { db, must } from "@/lib/supabase";

export const maxDuration = 120;

/** Polled by the join page. When both Apify runs finish, stores the results and rehosts images. */
export async function POST(_req: Request, ctx: RouteContext<"/api/people/[id]/scrape">) {
  const { id } = await ctx.params;
  const sources = must(await db().from("sources").select("kind,apify_run_id,status").eq("person_id", id)) as
    { kind: string; apify_run_id: string | null; status: string }[];
  if (sources.every((s) => s.status === "done" || s.status === "failed")) {
    return NextResponse.json({ done: true, linkedin: sources.find((s) => s.kind === "linkedin")?.status, instagram: sources.find((s) => s.kind === "instagram")?.status });
  }
  const li = sources.find((s) => s.kind === "linkedin");
  const ig = sources.find((s) => s.kind === "instagram");
  const [liState, igState] = await Promise.all([
    li?.apify_run_id ? getRun(li.apify_run_id) : null,
    ig?.apify_run_id ? getRun(ig.apify_run_id) : null,
  ]);
  const status = { linkedin: liState?.status ?? "missing", instagram: igState?.status ?? "missing" };
  if (!(liState?.done ?? true) || !(igState?.done ?? true)) return NextResponse.json({ done: false, ...status });

  const [liItems, igItems] = await Promise.all([
    liState?.ok ? getItems(liState.datasetId) : [],
    igState?.ok ? getItems(igState.datasetId) : [],
  ]);
  const r = await storeScrape(id, liItems[0] ?? null, igItems[0] ?? null, { li: li?.apify_run_id ?? undefined, ig: ig?.apify_run_id ?? undefined });
  return NextResponse.json({ done: true, linkedin: r.liOk ? "done" : "failed", instagram: r.igOk ? "done" : "failed" });
}
