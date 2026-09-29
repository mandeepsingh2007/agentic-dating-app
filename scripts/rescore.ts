// Re-writes both private verdicts for every finished pool date with the current verdict prompt,
// then recomputes all seed rankings.
import fs from "node:fs";
import pLimit from "p-limit";
import { rescoreDate } from "../src/lib/dating";
import { seedIds } from "../src/lib/pool";
import { computeRanking } from "../src/lib/ranking";
import { db, must } from "../src/lib/supabase";

async function main() {
  const idsFile = process.argv.find((a) => a.startsWith("--ids="))?.split("=")[1];
  const dates = idsFile
    ? fs.readFileSync(idsFile, "utf8").split(/\s+/).filter(Boolean).map((id) => ({ id }))
    : (must(await db().from("dates").select("id").eq("status", "done").limit(2000)) as { id: string }[]);
  console.log(`Rescoring ${dates.length} dates...`);
  const limit = pLimit(Number(process.env.RESCORE_CONCURRENCY ?? 12));
  let n = 0, failed = 0;
  await Promise.all(dates.map((d) => limit(async () => {
    try { await rescoreDate(d.id); } catch (e) { failed++; console.error("fail", d.id, (e as Error).message.slice(0, 150)); }
    if (++n % 25 === 0) console.log(`${n}/${dates.length} (${failed} failed)`);
  })));
  for (const id of await seedIds()) await computeRanking(id);
  console.log(`Rescored ${n - failed}, failed ${failed}. Rankings computed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
