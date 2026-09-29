import { JoinPipeline } from "@/components/JoinPipeline";
import { db, must } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function JoinPage(props: PageProps<"/join/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const seeking = ["women", "men", "everyone"].includes(String(sp.seeking)) ? String(sp.seeking) : undefined;
  const gender = ["woman", "man", "unknown"].includes(String(sp.gender)) ? String(sp.gender) : undefined;
  const pool = must(await db().from("people").select("id,name,photo_url").eq("is_seed", true)) as { id: string; name: string; photo_url: string | null }[];
  return <div className="glow"><JoinPipeline personId={id} pool={pool} seeking={seeking} gender={gender} /></div>;
}
