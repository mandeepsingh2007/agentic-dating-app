// Applies gender-aware matching to the existing pool: drops dates between people who wouldn't
// want to meet, then recomputes rankings from the remaining (real) dates.
import { pruneUnmatchableDates, seedIds } from "../src/lib/pool";
import { computeRanking } from "../src/lib/ranking";
import { db } from "../src/lib/supabase";

async function main() {
  console.log("Removed dates:", await pruneUnmatchableDates());
  for (const id of await seedIds()) await computeRanking(id);
  const { count } = await db().from("dates").select("id", { count: "exact", head: true }).eq("status", "done");
  console.log("Remaining finished dates:", count, "- rankings recomputed");
}

main().catch((e) => { console.error(e); process.exit(1); });
