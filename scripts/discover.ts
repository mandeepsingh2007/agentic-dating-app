// Scrapes every candidate on LinkedIn + Instagram via Apify, saves raw JSON,
// and keeps only people whose two profiles clearly belong to the same person.
import fs from "node:fs";
import path from "node:path";
import {
  startLinkedIn, startInstagram, waitForRun, getItems,
  normalizeLinkedIn, normalizeInstagram, linkedInSlug,
} from "../src/lib/apify";
import { readCsv, writeCsv } from "./csv";

type Li = { publicIdentifier?: string; firstName?: string; lastName?: string; headline?: string; query?: { publicIdentifier?: string }; status?: number };
type Ig = { username?: string; fullName?: string; private?: boolean; latestPosts?: unknown[]; biography?: string; externalUrl?: string };

const norm = (s = "") => s.normalize("NFKD").replace(/[^\p{L} ]/gu, " ").toLowerCase().split(/\s+/).filter(Boolean);

function sameName(expected: string, actual = "") {
  const e = norm(expected);
  const a = new Set(norm(actual));
  if (!a.size) return false;
  const last = e[e.length - 1];
  return a.has(last) || e.filter((t) => a.has(t)).length >= 1;
}

async function main() {
  const rows = readCsv("data/candidates.csv").map((r) => ({
    name: r.name,
    li: normalizeLinkedIn(r.linkedin_url)!,
    ig: normalizeInstagram(r.instagram_url)!,
  }));
  fs.mkdirSync("data/raw", { recursive: true });

  const igFile = "data/raw/instagram.json";
  let igItems: Ig[];
  if (fs.existsSync(igFile)) {
    igItems = JSON.parse(fs.readFileSync(igFile, "utf8"));
  } else {
    const igRun = await startInstagram(rows.map((r) => r.ig));
    igItems = await getItems<Ig>((await waitForRun(igRun)).datasetId);
    fs.writeFileSync(igFile, JSON.stringify(igItems, null, 2));
  }
  const igOk = new Set(igItems.filter((i) => i.username && !i.private && (i.latestPosts?.length ?? 0) > 0).map((i) => i.username!.toLowerCase()));

  const liFile = "data/raw/linkedin.json";
  let liItems: Li[] = fs.existsSync(liFile) ? JSON.parse(fs.readFileSync(liFile, "utf8")) : [];
  liItems = liItems.filter((i) => i.firstName || i.publicIdentifier);
  const have = new Set(liItems.map((i) => (i.query?.publicIdentifier ?? i.publicIdentifier ?? "").toLowerCase()));
  const todo = rows.filter((r) => igOk.has(r.ig) && !have.has(linkedInSlug(r.li)));

  // Apify free plan: this actor returns at most 10 items per run, and max 5 concurrent runs.
  const chunks: string[][] = [];
  for (let i = 0; i < todo.length; i += 10) chunks.push(todo.slice(i, i + 10).map((r) => r.li));
  console.log(`LinkedIn: ${todo.length} profiles in ${chunks.length} runs`);
  for (let i = 0; i < chunks.length; i += 4) {
    const batch = await Promise.all(chunks.slice(i, i + 4).map(async (urls) => {
      const state = await waitForRun(await startLinkedIn(urls));
      console.log("LinkedIn run", state.status);
      return getItems<Li>(state.datasetId);
    }));
    liItems.push(...batch.flat().filter((it) => it.firstName || it.publicIdentifier));
  }
  fs.writeFileSync(liFile, JSON.stringify(liItems, null, 2));

  const liBySlug = new Map<string, Li>();
  for (const it of liItems) {
    for (const k of [it.publicIdentifier, it.query?.publicIdentifier]) if (k) liBySlug.set(k.toLowerCase(), it);
  }
  const igByUser = new Map(igItems.filter((i) => i.username).map((i) => [i.username!.toLowerCase(), i]));

  const verified: Record<string, string>[] = [];
  for (const r of rows) {
    const li = liBySlug.get(linkedInSlug(r.li));
    const ig = igByUser.get(r.ig);
    const liName = li ? `${li.firstName ?? ""} ${li.lastName ?? ""}`.trim() : "";
    const okLi = !!li && sameName(r.name, liName);
    const okIg = !!ig && !ig.private && sameName(r.name, `${ig.fullName ?? ""} ${ig.username ?? ""}`) && (ig.latestPosts?.length ?? 0) > 0;
    console.log(
      `${okLi && okIg ? "OK  " : "FAIL"} ${r.name.padEnd(22)} LI:${okLi ? "ok" : "x"} (${liName || "-"}) IG:${okIg ? "ok" : "x"} (${ig?.fullName ?? "-"}, posts ${ig?.latestPosts?.length ?? 0})`,
    );
    if (okLi && okIg) verified.push({ name: liName || r.name, linkedin_url: r.li, instagram_url: `https://www.instagram.com/${r.ig}` });
  }

  writeCsv(path.join("data", "people.csv"), verified, ["name", "linkedin_url", "instagram_url"]);
  console.log(`\nVerified ${verified.length}/${rows.length} -> data/people.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
