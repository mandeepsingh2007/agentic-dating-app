import type { VerdictT } from "./dating";
import type { ProfileT } from "./profile-schema";
import { db, must } from "./supabase";

export type PersonRow = {
  id: string; name: string; linkedin_url: string; instagram_url: string; ig_username: string | null;
  headline: string | null; location: string | null; photo_url: string | null; is_seed: boolean; status: string; error: string | null;
};
export type SourceRow = {
  kind: "linkedin" | "instagram"; status: string; error: string | null; apify_actor: string | null;
  images: { postId: string; url: string; caption?: string; postUrl?: string }[] | null;
  raw: Record<string, unknown> | null;
};
export type RankingRow = {
  person_id: string; candidate_id: string; rank: number; score: number; my_view: number; their_view: number; mutual: boolean;
  reasons: { headline: string; top: string[]; concerns: string[]; dealbreaker: boolean } | null; date_id: string | null;
};

const PERSON_COLS = "id,name,linkedin_url,instagram_url,ig_username,headline,location,photo_url,is_seed,status,error";

export async function listSeedPeople() {
  const people = must(await db().from("people").select(PERSON_COLS).eq("is_seed", true).order("name")) as PersonRow[];
  const profiles = must(await db().from("profiles").select("person_id,data")) as { person_id: string; data: ProfileT }[];
  const byId = new Map(profiles.map((p) => [p.person_id, p.data]));
  return people.map((p) => ({ ...p, profile: byId.get(p.id) ?? null }));
}

export async function getPerson(id: string) {
  const person = must(await db().from("people").select(PERSON_COLS).eq("id", id).maybeSingle()) as PersonRow | null;
  if (!person) return null;
  const [profile, sources] = await Promise.all([
    db().from("profiles").select("data,photo_notes,model").eq("person_id", id).maybeSingle(),
    db().from("sources").select("kind,status,error,apify_actor,images,raw").eq("person_id", id),
  ]);
  return {
    person,
    profile: (profile.data?.data as ProfileT) ?? null,
    photoNotes: profile.data?.photo_notes as { photos: { postId: string; scene: string; activities: string[]; vibe: string }[] } | null,
    sources: (sources.data ?? []) as SourceRow[],
  };
}

export async function getRanking(personId: string) {
  const rows = must(await db().from("rankings").select("*").eq("person_id", personId).order("rank")) as RankingRow[];
  const ids = rows.map((r) => r.candidate_id);
  const people = ids.length ? (must(await db().from("people").select(PERSON_COLS).in("id", ids)) as PersonRow[]) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, candidate: byId.get(r.candidate_id)! })).filter((r) => r.candidate);
}

export async function getAllRankings() {
  const rows = must(await db().from("rankings").select("*").lte("rank", 5).order("rank").limit(2000)) as RankingRow[];
  return rows;
}

export async function getStats() {
  const [people, dates, done, messages] = await Promise.all([
    db().from("people").select("id", { count: "exact", head: true }).eq("is_seed", true),
    db().from("dates").select("id", { count: "exact", head: true }),
    db().from("dates").select("id", { count: "exact", head: true }).eq("status", "done"),
    db().from("date_messages").select("id", { count: "exact", head: true }),
  ]);
  return { people: people.count ?? 0, dates: dates.count ?? 0, done: done.count ?? 0, messages: messages.count ?? 0 };
}

export async function getDate(id: string) {
  const date = must(await db().from("dates").select("*").eq("id", id).maybeSingle()) as
    | { id: string; a_id: string; b_id: string; status: string; round: number; error: string | null } | null;
  if (!date) return null;
  const [messages, verdicts, people] = await Promise.all([
    db().from("date_messages").select("id,speaker_id,turn,phase,content").eq("date_id", id).order("turn"),
    db().from("verdicts").select("judge_id,about_id,data").eq("date_id", id),
    db().from("people").select(PERSON_COLS).in("id", [date.a_id, date.b_id]),
  ]);
  return {
    date,
    messages: (messages.data ?? []) as { id: number; speaker_id: string; turn: number; phase: string; content: string }[],
    verdicts: (verdicts.data ?? []) as { judge_id: string; about_id: string; data: VerdictT }[],
    people: (people.data ?? []) as PersonRow[],
  };
}

export async function listPersonDates(personId: string) {
  const dates = must(await db().from("dates").select("id,a_id,b_id,status").or(`a_id.eq.${personId},b_id.eq.${personId}`).limit(500)) as
    { id: string; a_id: string; b_id: string; status: string }[];
  return dates;
}
