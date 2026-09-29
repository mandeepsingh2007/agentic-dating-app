import { DateNight } from "@/components/DateNight";
import { db, must } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DateNightPage(props: PageProps<"/date-night">) {
  const sp = await props.searchParams;
  const personId = typeof sp.person === "string" ? sp.person : undefined;
  const people = must(await db().from("people").select("id,name,photo_url")) as { id: string; name: string; photo_url: string | null }[];
  return <div className="glow"><DateNight people={people} personId={personId} /></div>;
}
