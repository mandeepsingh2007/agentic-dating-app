import { ApifyClient } from "apify-client";

export const LINKEDIN_ACTOR = "harvestapi/linkedin-profile-scraper";
export const INSTAGRAM_ACTOR = "apify/instagram-profile-scraper";

let client: ApifyClient | null = null;
function apify() {
  if (!client) {
    if (!process.env.APIFY_TOKEN) throw new Error("APIFY_TOKEN missing");
    client = new ApifyClient({ token: process.env.APIFY_TOKEN });
  }
  return client;
}

export function normalizeLinkedIn(input: string): string | null {
  const m = input.trim().match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  return `https://www.linkedin.com/in/${decodeURIComponent(m[1]).toLowerCase()}`;
}

export function linkedInSlug(url: string): string {
  return url.replace(/\/$/, "").split("/in/")[1] ?? "";
}

export function normalizeInstagram(input: string): string | null {
  const s = input.trim();
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const user = m ? m[1] : s.replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(user)) return null;
  if (["p", "reel", "reels", "stories", "explore"].includes(user.toLowerCase())) return null;
  return user.toLowerCase();
}

export async function startLinkedIn(urls: string[]) {
  const run = await apify()
    .actor(LINKEDIN_ACTOR)
    .start({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: urls });
  return run.id;
}

export async function startInstagram(usernames: string[]) {
  const run = await apify().actor(INSTAGRAM_ACTOR).start({ usernames });
  return run.id;
}

export type RunState = { status: string; done: boolean; ok: boolean; datasetId: string };

export async function getRun(runId: string): Promise<RunState> {
  const run = await apify().run(runId).get();
  if (!run) throw new Error(`Apify run ${runId} not found`);
  const done = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status);
  return { status: run.status, done, ok: run.status === "SUCCEEDED", datasetId: run.defaultDatasetId };
}

export async function getItems<T = Record<string, unknown>>(datasetId: string): Promise<T[]> {
  const { items } = await apify().dataset(datasetId).listItems({ clean: true });
  return items as T[];
}

export async function waitForRun(runId: string, timeoutMs = 10 * 60_000): Promise<RunState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getRun(runId);
    if (state.done) return state;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Apify run ${runId} timed out`);
}
