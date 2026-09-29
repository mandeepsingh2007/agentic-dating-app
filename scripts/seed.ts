// Imports the verified people (data/people.csv) using the raw Apify output in data/raw,
// rehosts their photos, then runs the Analyst agent for each.
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import pLimit from "p-limit";
import { linkedInSlug, normalizeInstagram, normalizeLinkedIn } from "../src/lib/apify";
import { createPerson, storeScrape } from "../src/lib/ingest";
import { analyzePerson } from "../src/lib/analyst";
import { db } from "../src/lib/supabase";
import { readCsv } from "./csv";

async function main() {
  const li: any[] = JSON.parse(fs.readFileSync("data/raw/linkedin.json", "utf8"));
  const ig: any[] = JSON.parse(fs.readFileSync("data/raw/instagram.json", "utf8"));
  const people = readCsv("data/people.csv");
  const onlyAnalyze = process.argv.includes("--analyze-only");

  await db().storage.createBucket("ig-images", { public: true }).catch(() => null);

  const limit = pLimit(3);
  let done = 0;
  await Promise.all(people.map((p) => limit(async () => {
    const liUrl = normalizeLinkedIn(p.linkedin_url)!;
    const igUser = normalizeInstagram(p.instagram_url)!;
    try {
      const id = await createPerson({ name: p.name, linkedin_url: liUrl, instagram_url: `https://www.instagram.com/${igUser}`, ig_username: igUser, is_seed: true });
      const { data: prof } = await db().from("profiles").select("person_id").eq("person_id", id).maybeSingle();
      if (prof) { console.log(`skip ${p.name} (already analysed)`); return; }
      let dataUrls: Record<string, string> = {};
      if (!onlyAnalyze) {
        const liRaw = li.find((x) => [x.publicIdentifier, x.query?.publicIdentifier].some((k) => k?.toLowerCase() === linkedInSlug(liUrl)));
        const igRaw = ig.find((x) => x.username?.toLowerCase() === igUser);
        const r = await storeScrape(id, liRaw, igRaw);
        dataUrls = r.dataUrls;
      }
      const profile = await analyzePerson(id, dataUrls);
      console.log(`[${++done}/${people.length}] ${p.name}: ${profile.oneLiner}`);
    } catch (e) {
      console.error(`FAILED ${p.name}:`, (e as Error).message.slice(0, 300));
    }
  })));
}

main().catch((e) => { console.error(e); process.exit(1); });
