import type { VerdictT } from "./dating";
import { isMatchable } from "./match";
import type { ProfileT } from "./profile-schema";
import { db, must } from "./supabase";

type VerdictRow = { date_id: string; judge_id: string; about_id: string; data: VerdictT };

export function viewScore(v: VerdictT) {
  return 0.4 * v.fitScore + 0.2 * v.chemistry + 0.25 * v.valuesAlignment + 0.15 * v.lifestyleFit;
}

/** Ranking for one person, computed purely from both sides' private verdicts. */
export async function computeRanking(personId: string) {
  const rows = must(await db().from("verdicts").select("*").or(`judge_id.eq.${personId},about_id.eq.${personId}`)) as VerdictRow[];
  const me = must(await db().from("people").select("is_seed").eq("id", personId).single()) as { is_seed: boolean };
  // Seed people are ranked only against the seed pool, so visitors don't reshuffle the demo.
  const seeds = me.is_seed
    ? new Set((must(await db().from("people").select("id").eq("is_seed", true)) as { id: string }[]).map((p) => p.id))
    : null;
  const profiles = must(await db().from("profiles").select("person_id,data")) as { person_id: string; data: ProfileT }[];
  const prof = new Map(profiles.map((p) => [p.person_id, p.data]));
  const myProfile = prof.get(personId);
  const mine = rows.filter((r) => {
    if (r.judge_id !== personId || (seeds && !seeds.has(r.about_id))) return false;
    const other = prof.get(r.about_id);
    return !!myProfile && !!other && isMatchable(myProfile, other);
  });
  const out = mine.map((m) => {
    const theirs = rows.find((r) => r.date_id === m.date_id && r.judge_id === m.about_id);
    const myView = viewScore(m.data);
    const theirView = theirs ? viewScore(theirs.data) : myView;
    const mutual = !!(m.data.wantsSecondDate && theirs?.data.wantsSecondDate);
    const score = 0.7 * myView + 0.3 * theirView - (m.data.dealbreakerHit ? 3 : 0) + (mutual ? 0.5 : 0);
    return {
      person_id: personId,
      candidate_id: m.about_id,
      score: Math.round(score * 100) / 100,
      my_view: Math.round(myView * 100) / 100,
      their_view: Math.round(theirView * 100) / 100,
      mutual,
      reasons: { headline: m.data.headline, top: m.data.topReasons, concerns: m.data.concerns, dealbreaker: m.data.dealbreakerHit },
      date_id: m.date_id,
    };
  });
  out.sort((a, b) => b.score - a.score);
  const ranked = out.map((r, i) => ({ ...r, rank: i + 1 }));
  await db().from("rankings").delete().eq("person_id", personId);
  if (ranked.length) must(await db().from("rankings").insert(ranked));
  await db().from("people").update({ status: "ranked" }).eq("id", personId);
  return ranked;
}
