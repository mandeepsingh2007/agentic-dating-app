// Runs every pairwise date in the seed pool, then computes everyone's ranking.
import pLimit from "p-limit";
import { runDate } from "../src/lib/dating";
import { createPoolDates, seedIds } from "../src/lib/pool";
import { computeRanking } from "../src/lib/ranking";

async function main() {
  const max = Number(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] ?? Infinity);
  const ids = (await createPoolDates()).slice(0, max);
  console.log(`Running ${ids.length} dates...`);
  const limit = pLimit(Number(process.env.DATE_CONCURRENCY ?? 16));
  let done = 0, failed = 0;
  const t0 = Date.now();
  await Promise.all(ids.map((id) => limit(async () => {
    try {
      await runDate(id);
      done++;
    } catch (e) {
      failed++;
      console.error("date failed", id, (e as Error).message.slice(0, 200));
    }
    if ((done + failed) % 10 === 0) console.log(`${done + failed}/${ids.length} (${failed} failed) ${Math.round((Date.now() - t0) / 1000)}s`);
  })));
  console.log(`Dates done: ${done}, failed: ${failed}`);
  if (process.argv.includes("--no-rank")) return;
  for (const id of await seedIds()) await computeRanking(id);
  console.log("Rankings computed");
}

main().catch((e) => { console.error(e); process.exit(1); });
