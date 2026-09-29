import { isMatchable } from "./match";
import type { ProfileT } from "./profile-schema";
import { db, must } from "./supabase";

async function seedProfiles() {
  const rows = must(await db().from("people").select("id, profiles!inner(data)").eq("is_seed", true).order("created_at")) as
    unknown as { id: string; profiles: { data: ProfileT } | { data: ProfileT }[] }[];
  return rows.map((r) => ({ id: r.id, profile: Array.isArray(r.profiles) ? r.profiles[0].data : r.profiles.data }));
}

/** Creates every round-1 date between seed people who want to meet each other. Returns pending/failed date ids. */
export async function createPoolDates() {
  const people = await seedProfiles();
  const existing = must(await db().from("dates").select("a_id,b_id").eq("round", 1)) as { a_id: string; b_id: string }[];
  const have = new Set(existing.map((d) => [d.a_id, d.b_id].sort().join(":")));
  const rows: { a_id: string; b_id: string; round: number }[] = [];
  let k = 0;
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const [x, y] = [people[i], people[j]];
      if (!isMatchable(x.profile, y.profile) || have.has([x.id, y.id].sort().join(":"))) continue;
      rows.push(k++ % 2 === 0 ? { a_id: x.id, b_id: y.id, round: 1 } : { a_id: y.id, b_id: x.id, round: 1 });
    }
  }
  for (let i = 0; i < rows.length; i += 200) must(await db().from("dates").insert(rows.slice(i, i + 200)));
  const seedSet = new Set(people.map((p) => p.id));
  const pending = must(await db().from("dates").select("id,a_id,b_id,status").eq("round", 1).in("status", ["pending", "failed", "live"]).limit(5000)) as { id: string; a_id: string; b_id: string }[];
  return pending.filter((d) => seedSet.has(d.a_id) && seedSet.has(d.b_id)).map((d) => d.id);
}

/** Removes pool dates between people who would not want to meet (e.g. created before gender-aware matching). */
export async function pruneUnmatchableDates() {
  const people = await seedProfiles();
  const prof = new Map(people.map((p) => [p.id, p.profile]));
  const dates = must(await db().from("dates").select("id,a_id,b_id").limit(5000)) as { id: string; a_id: string; b_id: string }[];
  const bad = dates.filter((d) => prof.has(d.a_id) && prof.has(d.b_id) && !isMatchable(prof.get(d.a_id)!, prof.get(d.b_id)!)).map((d) => d.id);
  for (let i = 0; i < bad.length; i += 100) must(await db().from("dates").delete().in("id", bad.slice(i, i + 100)));
  return bad.length;
}

export async function seedIds() {
  const people = must(await db().from("people").select("id").eq("is_seed", true)) as { id: string }[];
  return people.map((p) => p.id);
}
