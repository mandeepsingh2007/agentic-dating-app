// Removes people whose LinkedIn turned out to be a namesake, then re-runs the
// Analyst agent (with photo vision) for everyone else.
import pLimit from "p-limit";
import fs from "node:fs";
import { analyzePerson } from "../src/lib/analyst";
import { db, must } from "../src/lib/supabase";

const WRONG_LINKEDIN = ["jayshetty", "sarablakely", "danmartell"];

async function main() {
  for (const slug of WRONG_LINKEDIN) {
    await db().from("people").delete().eq("linkedin_url", `https://www.linkedin.com/in/${slug}`);
  }
  const csv = fs.readFileSync("data/people.csv", "utf8").split("\n").filter((l) => !WRONG_LINKEDIN.some((s) => l.includes(`/in/${s},`)));
  fs.writeFileSync("data/people.csv", csv.join("\n"));

  const people = must(await db().from("people").select("id,name").eq("is_seed", true)) as { id: string; name: string }[];
  console.log(`Re-analysing ${people.length} people with photos...`);
  const limit = pLimit(4);
  let n = 0;
  await Promise.all(people.map((p) => limit(async () => {
    try {
      const prof = await analyzePerson(p.id);
      const { data } = await db().from("profiles").select("photo_notes").eq("person_id", p.id).single();
      console.log(`[${++n}/${people.length}] ${p.name} (photos: ${data?.photo_notes?.photos?.length ?? 0}): ${prof.oneLiner}`);
    } catch (e) {
      console.error(`FAILED ${p.name}:`, (e as Error).message.slice(0, 300));
    }
  })));
}

main().catch((e) => { console.error(e); process.exit(1); });
